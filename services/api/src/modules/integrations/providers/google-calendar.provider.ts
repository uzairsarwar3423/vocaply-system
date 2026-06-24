// ─────────────────────────────────────────────────────────────────────────────
// google-calendar.provider.ts — Google Calendar Provider (User-Level)
//
// STRUCTURAL DIFFERENCE from other providers:
//   This provider does NOT implement team-level IntegrationProvider.
//   Google Calendar connection is PER USER (user_integrations table),
//   not per team (team_integrations table). Do NOT route this through
//   integrations.service.ts's team-scoped functions.
//
// Token refresh critical note:
//   The authorize URL MUST include: access_type=offline AND prompt=consent
//   If either is missing, the exchange succeeds but refresh_token will be ABSENT.
//   The integration will silently die in ~1 hour with no recovery path other
//   than forcing the user through OAuth again. Guard against this explicitly.
//
// syncToken + 410 handling:
//   listEvents returns the 410 Gone error raw — the CALLER (calendar-sync.service)
//   catches 410 and retries without syncToken. This function does NOT retry
//   internally, keeping its behavior predictable and testable.
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios'
import { logger } from '../../../config/logger'
import { decrypt, encrypt } from '../../../utils/crypto'
import { env } from '../../../config/env'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface GoogleCalendarTokenResponse {
    accessToken: string
    refreshToken: string | null
    expiresIn: number
}

export interface GoogleCalendarTokenRefreshResponse {
    accessToken: string
    expiresIn: number
    // Google does NOT rotate the refresh token on a normal refresh.
    // The SAME refresh token remains valid and is NOT re-stored unless
    // Google explicitly returns a new one (rare key rotation event).
}

export interface GoogleCalendarEvent {
    id?: string | null
    summary?: string | null
    description?: string | null
    location?: string | null
    status?: string | null
    start?: { dateTime?: string | null; date?: string | null } | null
    end?: { dateTime?: string | null; date?: string | null } | null
    attendees?: Array<{ email?: string | null; responseStatus?: string | null }> | null
    conferenceData?: {
        entryPoints?: Array<{
            entryPointType?: string | null
            uri?: string | null
        }> | null
    } | null
}

export interface GoogleCalendarListResult {
    items: GoogleCalendarEvent[]
    nextSyncToken: string | null
    nextPageToken: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared Google OAuth token endpoint
// ─────────────────────────────────────────────────────────────────────────────

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

// ─────────────────────────────────────────────────────────────────────────────
// GoogleCalendarProvider
// ─────────────────────────────────────────────────────────────────────────────

export class GoogleCalendarProvider {

    // ── Token Exchange ────────────────────────────────────────────────────────
    // CRITICAL: must be called with a code from an authorize URL that included:
    //   access_type=offline AND prompt=consent
    // Absence of either → refresh_token will be null → CRITICAL log emitted.

    async exchangeCodeForTokens(
        code: string,
        redirectUri: string
    ): Promise<GoogleCalendarTokenResponse> {
        const response = await axios.post(
            GOOGLE_TOKEN_URL,
            new URLSearchParams({
                code,
                client_id: env.GOOGLE_CLIENT_ID!,
                client_secret: env.GOOGLE_CLIENT_SECRET!,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code',
            }),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 10_000,
            }
        )

        const tokens = response.data
        const accessToken: string = tokens.access_token
        const refreshToken: string | null = tokens.refresh_token ?? null
        const expiresIn: number = tokens.expires_in ?? 3600

        // Guard against missing refresh_token — this should NEVER happen if the
        // authorize URL was built correctly with access_type=offline and prompt=consent.
        // If it does, it MUST be loud, not silent.
        if (!refreshToken) {
            logger.error(
                { redirectUri },
                'CRITICAL: Google Calendar token exchange succeeded but refresh_token is absent. ' +
                'The authorize URL may be missing access_type=offline or prompt=consent. ' +
                'This integration will die in ~1 hour with no recovery path until the user reconnects.'
            )
        }

        return { accessToken, refreshToken, expiresIn }
    }

    // ── Token Refresh ─────────────────────────────────────────────────────────

    async refreshAccessToken(refreshTokenEnc: string): Promise<GoogleCalendarTokenRefreshResponse> {
        const refreshToken = decrypt(refreshTokenEnc)

        const response = await axios.post(
            GOOGLE_TOKEN_URL,
            new URLSearchParams({
                refresh_token: refreshToken,
                client_id: env.GOOGLE_CLIENT_ID!,
                client_secret: env.GOOGLE_CLIENT_SECRET!,
                grant_type: 'refresh_token',
            }),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 10_000,
            }
        )

        return {
            accessToken: response.data.access_token,
            expiresIn: response.data.expires_in ?? 3600,
        }
    }

    // ── List Calendar Events ──────────────────────────────────────────────────
    // IMPORTANT: syncToken and time-range params are MUTUALLY EXCLUSIVE per Google's API.
    // If syncToken is provided, timeMin/timeMax must NOT be included.
    // If Google responds 410 Gone → the CALLER catches and retries without syncToken.

    async listEvents(params: {
        accessTokenEnc: string
        calendarId: string
        timeMin?: string
        timeMax?: string
        syncToken?: string | null
        maxResults?: number
    }): Promise<GoogleCalendarListResult> {
        const accessToken = decrypt(params.accessTokenEnc)

        const queryParams: Record<string, string | number | boolean> = {
            singleEvents: true,
            maxResults: params.maxResults ?? 250,
        }

        if (params.syncToken) {
            // syncToken and time-range are mutually exclusive
            queryParams.syncToken = params.syncToken
        } else {
            if (params.timeMin) queryParams.timeMin = params.timeMin
            if (params.timeMax) queryParams.timeMax = params.timeMax
            queryParams.orderBy = 'startTime'
        }

        const response = await axios.get(
            `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(params.calendarId)}/events`,
            {
                params: queryParams,
                headers: { Authorization: `Bearer ${accessToken}` },
                timeout: 15_000,
            }
        )

        return {
            items: response.data.items || [],
            nextSyncToken: response.data.nextSyncToken || null,
            nextPageToken: response.data.nextPageToken || null,
        }
    }

    // ── Test Connection ───────────────────────────────────────────────────────

    async testConnection(accessTokenEnc: string): Promise<{ healthy: boolean }> {
        try {
            const accessToken = decrypt(accessTokenEnc)
            await axios.get(`${GOOGLE_CALENDAR_API}/users/me/calendarList`, {
                params: { maxResults: 1 },
                headers: { Authorization: `Bearer ${accessToken}` },
                timeout: 10_000,
            })
            return { healthy: true }
        } catch (err: any) {
            logger.warn({ error: err.message }, 'GoogleCalendarProvider testConnection failed')
            return { healthy: false }
        }
    }

    // ── Revoke Token ──────────────────────────────────────────────────────────

    async revokeToken(accessTokenEnc: string): Promise<void> {
        try {
            const accessToken = decrypt(accessTokenEnc)
            await axios.post(
                `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`,
                {},
                { timeout: 5_000 }
            )
        } catch (err: any) {
            logger.warn({ error: err.message }, 'GoogleCalendarProvider revokeToken failed (best-effort)')
        }
    }
}

export const googleCalendarProvider = new GoogleCalendarProvider()
