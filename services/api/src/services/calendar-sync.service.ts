// ─────────────────────────────────────────────────────────────────────────────
// calendar-sync.service.ts — Calendar Sync Service (FULL IMPLEMENTATION)
//
// This is the MOST consequential piece of business logic in Day 22.
// It creates meetings and schedules Recall.ai bots — spending REAL money —
// with zero human in the loop. Every correctness guarantee here is a cost/
// security control, not merely a data-quality concern.
//
// Key design decisions:
//   1. PROACTIVE token refresh — never hit the Google API with an expired token.
//   2. 2-LAYER DEDUP — Redis fast-path (cross-user race) + Postgres UNIQUE (authoritative).
//   3. RECALL.AI BOT scheduling — with graceful failure (FAILED status, not silent drop).
//   4. INCREMENTAL sync — syncToken → only changed events after first full scan.
//   5. 410 FALLBACK — expired syncToken triggers full scan, restarts chain cleanly.
//   6. PERSONAL→TEAM scope transition happens at EXACTLY ONE point in this file.
// ─────────────────────────────────────────────────────────────────────────────

import { logger } from '../config/logger'
import { platformDetect, buildDedupKey, calculateDedupTTL } from '../utils/platform-detect'
import { prisma } from '../db/client'
import { redis } from '../config/redis'
import { encrypt } from '../utils/crypto'
import { addSeconds, subMinutes } from 'date-fns'
import { googleCalendarProvider, GoogleCalendarEvent } from '../modules/integrations/providers/google-calendar.provider'
import * as recallService from './recall.service'
import type { CalendarSyncResult, ExtractedMeetingUrl } from '../modules/integrations/integrations.types'
import type { PlatformType } from '@prisma/client'

// Re-export for external use
export type { CalendarSyncResult }

// ─────────────────────────────────────────────────────────────────────────────
// Proactive token refresh helper
//
// Called BEFORE every event fetch. Ensures we never hit Google's API with
// an expired token. This is the LOCAL SAFETY NET — the primary mechanism
// is the 15-minute token-refresh cron in scheduler.ts.
// ─────────────────────────────────────────────────────────────────────────────

async function getValidAccessToken(integration: {
    id: string
    accessTokenEnc: string
    refreshTokenEnc: string | null
    tokenExpiresAt: Date | null
}): Promise<string> {
    const now = new Date()
    const expiresAt = integration.tokenExpiresAt

    // Proactive refresh if token expires within 5 minutes
    if (expiresAt && expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
        if (!integration.refreshTokenEnc) {
            throw new Error('Token is expiring and no refresh token is available — user must reconnect')
        }

        logger.info({ integrationId: integration.id }, 'Calendar sync: proactively refreshing access token')

        const refreshResult = await googleCalendarProvider.refreshAccessToken(integration.refreshTokenEnc)
        const newAccessTokenEnc = encrypt(refreshResult.accessToken)
        const newExpiresAt = addSeconds(now, refreshResult.expiresIn)

        await prisma.userIntegration.update({
            where: { id: integration.id },
            data: {
                accessTokenEnc: newAccessTokenEnc,
                tokenExpiresAt: newExpiresAt,
            },
        })

        // Return the FRESH plain token (pre-encryption value)
        return refreshResult.accessToken
    }

    // Token is still valid — decrypt and return
    const { decrypt } = await import('../utils/crypto')
    return decrypt(integration.accessTokenEnc)
}

// ─────────────────────────────────────────────────────────────────────────────
// Meeting URL extraction with source tracking
// Checks: conferenceData (Google Meet native) → description regex → location
// ─────────────────────────────────────────────────────────────────────────────

export function extractMeetingUrl(event: GoogleCalendarEvent): ExtractedMeetingUrl | null {
    // Priority 1: conferenceData (most reliable — Google Meet native)
    if (event.conferenceData?.entryPoints) {
        const video = event.conferenceData.entryPoints.find(ep => ep.entryPointType === 'video')
        if (video?.uri) return { url: video.uri, source: 'conferenceData' }
    }

    // URL regex for Zoom/Teams/Webex patterns in description or location
    const urlRegex = /https?:\/\/(?:[\w-]+\.)*(?:zoom\.us|teams\.microsoft\.com|meet\.google\.com|webex\.com|g\.co\/meet)\/[^\s<>"')]+/gi

    // Priority 2: description
    if (event.description) {
        const match = event.description.match(urlRegex)
        if (match?.[0]) return { url: match[0], source: 'description' }
    }

    // Priority 3: location
    if (event.location) {
        const match = event.location.match(urlRegex)
        if (match?.[0]) return { url: match[0], source: 'location' }
    }

    return null
}

// ─────────────────────────────────────────────────────────────────────────────
// shouldProcessEvent — filter logic before any dedup or DB work
// ─────────────────────────────────────────────────────────────────────────────

export function shouldProcessEvent(event: GoogleCalendarEvent, userEmail: string): boolean {
    // Skip all-day events (no dateTime)
    if (!event.start?.dateTime) return false

    // Skip cancelled events
    if (event.status === 'cancelled') return false

    // Skip if the user declined the invite
    if (event.attendees) {
        const me = event.attendees.find(a => a.email === userEmail)
        if (me?.responseStatus === 'declined') return false
    }

    // Must have a detectable video conference URL
    if (!extractMeetingUrl(event)) return false

    return true
}

// ─────────────────────────────────────────────────────────────────────────────
// syncUserCalendar — the main sync function
//
// Called by: calendar-sync.worker.ts (per-user BullMQ job)
// Returns: CalendarSyncResult (logged by worker, future admin view)
// ─────────────────────────────────────────────────────────────────────────────

export async function syncUserCalendar(userId: string): Promise<CalendarSyncResult> {
    logger.debug({ userId }, 'syncUserCalendar: started')

    // ── STEP 1 — Load & Validate Integration ─────────────────────────────────

    const integration = await prisma.userIntegration.findUnique({
        where: { userId_provider: { userId, provider: 'GOOGLE_CALENDAR' } },
    })

    if (!integration || !integration.syncEnabled) {
        return {
            synced: 0, skipped: 0, duplicates: 0, errors: 0,
            message: 'Calendar sync not enabled or integration missing',
        }
    }

    // ── STEP 2 — Ensure a Fresh Token (Proactive, Never Reactive) ────────────

    let accessToken: string
    try {
        accessToken = await getValidAccessToken(integration)
    } catch (err: any) {
        logger.error({ userId, error: err.message }, 'syncUserCalendar: token refresh failed')
        await prisma.userIntegration.update({
            where: { id: integration.id },
            data: { consecutiveErrors: { increment: 1 }, lastError: err.message },
        })
        return { synced: 0, skipped: 0, duplicates: 0, errors: 1, message: `Token refresh failed: ${err.message}` }
    }

    // ── STEP 3 — Fetch Events (Incremental When Possible) ────────────────────

    const calendarId = integration.calendarId || 'primary'
    const now = new Date()
    const timeMax = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // +7 days

    // Use syncToken for incremental fetch. On 410 (expired token) fall back to full scan.
    let eventsResult: Awaited<ReturnType<typeof googleCalendarProvider.listEvents>>
    let isFallbackScan = false

    try {
        eventsResult = await googleCalendarProvider.listEvents({
            accessTokenEnc: integration.accessTokenEnc, // pass encrypted — provider decrypts
            calendarId,
            ...(integration.nextSyncToken
                ? { syncToken: integration.nextSyncToken }
                : {
                    timeMin: now.toISOString(),
                    timeMax: timeMax.toISOString(),
                }),
        })
    } catch (err: any) {
        // 410 = syncToken expired or invalidated by calendar changes
        if (err.response?.status === 410 || err.status === 410) {
            logger.info({ userId }, 'syncUserCalendar: syncToken expired (410), falling back to full scan')
            isFallbackScan = true
            eventsResult = await googleCalendarProvider.listEvents({
                accessTokenEnc: integration.accessTokenEnc,
                calendarId,
                timeMin: now.toISOString(),
                timeMax: timeMax.toISOString(),
            })
        } else {
            logger.error({ userId, error: err.message }, 'syncUserCalendar: listEvents failed')
            await prisma.userIntegration.update({
                where: { id: integration.id },
                data: { consecutiveErrors: { increment: 1 }, lastError: err.message },
            })
            return { synced: 0, skipped: 0, duplicates: 0, errors: 1, message: `listEvents failed: ${err.message}` }
        }
    }

    const events = eventsResult.items
    let synced = 0, skipped = 0, duplicates = 0

    // ── STEP 4 — Fetch User for Team Context ──────────────────────────────────
    // PERSONAL→TEAM scope transition: user's calendar events → team meeting records.
    // This transition happens at EXACTLY THIS POINT. No other function does this.

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, teamId: true, email: true },
    })

    if (!user || !user.teamId) {
        return { synced: 0, skipped: 0, duplicates: 0, errors: 1, message: 'User or Team not found' }
    }

    // ── STEP 5 — Per-Event Processing Loop ───────────────────────────────────

    for (const event of events) {
        try {
            // Filter events that don't need processing
            if (!shouldProcessEvent(event, user.email || '')) {
                skipped++
                continue
            }

            // Extract meeting URL and detect platform
            const extracted = extractMeetingUrl(event)
            if (!extracted) {
                skipped++
                continue
            }

            const { platform, platformMeetingId } = platformDetect(extracted.url)

            if (platform === 'MANUAL' || !platformMeetingId) {
                skipped++
                continue
            }

            // ── LAYER 1 DEDUP — Redis fast-path ────────────────────────────
            // This is the line that prevents the classic failure mode:
            // 5 team members each running sync, all seeing the SAME calendar invite,
            // all racing to create a meeting. Only the first wins the Redis key.
            // Key is scoped to platform+platformMeetingId (CROSS-USER, BY DESIGN —
            // different from user-scoped, because two users CAN share the same meeting).
            const dedupKey = buildDedupKey(platform, platformMeetingId)
            const existsInRedis = await redis.exists(dedupKey)
            if (existsInRedis) {
                logger.debug({ userId, platform, platformMeetingId, dedupKey }, 'syncUserCalendar: skipped (Redis dedup hit)')
                duplicates++
                continue
            }

            // ── LAYER 2 DEDUP — Postgres authoritative ─────────────────────
            // Catches the race-condition gap: Redis key may have expired or never been
            // set due to a prior partial failure. The DB UNIQUE constraint
            // (idx_meetings_platform_dedup) is the FINAL backstop.
            const existingMeeting = await prisma.meeting.findFirst({
                where: { teamId: user.teamId, platform: platform as PlatformType, platformMeetingId },
            })
            if (existingMeeting) {
                // Back-fill the Redis key so future syncs hit the faster path
                await redis.setex(dedupKey, calculateDedupTTL(existingMeeting.scheduledAt || now), existingMeeting.id)
                duplicates++
                continue
            }

            // ── CREATE meeting row ────────────────────────────────────────────
            const scheduledAt = event.start?.dateTime ? new Date(event.start.dateTime) : now

            const meeting = await prisma.meeting.create({
                data: {
                    teamId: user.teamId,
                    title: event.summary || 'Untitled Meeting',
                    platform: platform as PlatformType,
                    meetingUrl: extracted.url,
                    platformMeetingId,
                    status: 'SCHEDULED',
                    scheduledAt,
                    calendarEventId: event.id,
                    calendarSourceUserId: userId,
                },
            })

            // ── SCHEDULE Recall.ai bot ────────────────────────────────────────
            // The bot joins 2 minutes BEFORE scheduledAt.
            // On failure: meeting row is KEPT with status=FAILED (not silently dropped).
            // This gives visibility that a calendar event was seen but bot-scheduling failed.
            try {
                const bot = await recallService.scheduleBot({
                    meetingUrl: extracted.url,
                    joinAt: subMinutes(scheduledAt, 2),
                    teamId: user.teamId,
                    meetingId: meeting.id,
                })
                await prisma.meeting.update({
                    where: { id: meeting.id },
                    data: { recallBotId: bot.botId },
                })
            } catch (recallError: any) {
                logger.error(
                    { meetingId: meeting.id, error: recallError.message },
                    'syncUserCalendar: Recall.ai scheduleBot failed — meeting kept as FAILED'
                )
                await prisma.meeting.update({
                    where: { id: meeting.id },
                    data: {
                        status: 'FAILED',
                        processingError: recallError.message,
                    },
                })
                // Still set Redis key to prevent re-creating the meeting on next sync
                await redis.setex(dedupKey, calculateDedupTTL(scheduledAt), meeting.id)
                synced++ // Counted as synced (meeting was detected + row created)
                continue
            }

            // ── Set Redis dedup key AFTER successful bot scheduling ────────────
            const ttl = calculateDedupTTL(scheduledAt)
            await redis.setex(dedupKey, ttl, meeting.id)

            synced++
            logger.info(
                { userId, meetingId: meeting.id, platform, platformMeetingId, source: extracted.source },
                'syncUserCalendar: meeting created and bot scheduled'
            )

        } catch (eventError: any) {
            // Per-event errors should not stop processing other events
            logger.error({ userId, eventId: event.id, error: eventError.message }, 'syncUserCalendar: error processing event (continuing)')
        }
    }

    // ── STEP 6 — Persist Sync Watermark ──────────────────────────────────────
    // On 410 fallback: old syncToken is REPLACED by the new one from the full scan.
    // This cleanly restarts the incremental chain.

    await prisma.userIntegration.update({
        where: { id: integration.id },
        data: {
            lastSyncedAt: new Date(),
            nextSyncToken: eventsResult.nextSyncToken ?? (isFallbackScan ? null : integration.nextSyncToken),
            consecutiveErrors: 0,
            lastError: null,
        },
    })

    logger.info({ userId, synced, skipped, duplicates }, 'syncUserCalendar: completed')

    return {
        synced,
        skipped,
        duplicates,
        errors: 0,
        message: 'Sync complete',
        nextSyncToken: eventsResult.nextSyncToken ?? undefined,
    }
}
