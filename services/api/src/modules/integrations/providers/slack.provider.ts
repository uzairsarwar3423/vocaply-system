// ─────────────────────────────────────────────────────────────────────────────
// slack.provider.ts — Slack Integration Provider
//
// Implements: IntegrationProvider (shared contract from Day 21)
// PLUS Slack-specific send functions (outside the shared interface, by design —
// generic contract vs. provider-specific actions are deliberately never mixed).
//
// Token model: BOT token. Not per-user.
//   Once ANY admin connects Slack, the integration works for the WHOLE team.
//   Slack bot tokens do NOT expire → refreshAccessToken() is a documented NO-OP.
//
// Rate limiting: Slack Tier 2 ≈ 1 message/second per channel.
//   Handled at the BullMQ queue-limiter level (Redis-backed, cross-replica safe).
//   Never use in-process setTimeout — it breaks under horizontal scaling.
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios'
import type { TeamIntegration } from '@prisma/client'
import type { IntegrationProvider, ProviderTestResult } from './provider.interface'
import type { ProviderTokenResponse, SlackWorkspaceMeta } from '../integrations.types'
import { OAUTH_CONFIGS } from './oauth-config'
import { decrypt } from '../../../utils/crypto'
import { logger } from '../../../config/logger'
import { env } from '../../../config/env'

// ── Block Kit type stubs (avoid importing full Slack SDK just for types) ──────

export interface SlackBlock {
    type: string
    [key: string]: unknown
}

export interface SlackSendResult {
    ok: boolean
    ts?: string
    channel?: string
    error?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helper — build a short Axios client for a given bot token
// ─────────────────────────────────────────────────────────────────────────────

function buildSlackClient(botToken: string) {
    return axios.create({
        baseURL: 'https://slack.com/api',
        headers: {
            Authorization: `Bearer ${botToken}`,
            'Content-Type': 'application/json; charset=utf-8',
        },
        timeout: 10_000,
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helper — resolve a DM channel for a Slack user ID
// Written ONCE and shared by both sendCommitmentMissedDM and sendDeadlineReminderDM
// ─────────────────────────────────────────────────────────────────────────────

async function openDMChannel(client: ReturnType<typeof buildSlackClient>, slackUserId: string): Promise<string | null> {
    try {
        const res = await client.post('/conversations.open', { users: slackUserId })
        if (res.data.ok && res.data.channel?.id) {
            return res.data.channel.id
        }
        logger.warn({ slackUserId, error: res.data.error }, 'Slack: conversations.open failed')
        return null
    } catch (err: any) {
        logger.warn({ slackUserId, error: err.message }, 'Slack: openDMChannel threw')
        return null
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helper — lookup Slack user ID by Vocaply email
// Returns null (never throws) — mismatch between Slack and Vocaply member lists
// is an EXPECTED condition, not an error.
// ─────────────────────────────────────────────────────────────────────────────

async function lookupSlackUserByEmail(
    client: ReturnType<typeof buildSlackClient>,
    email: string
): Promise<string | null> {
    try {
        const res = await client.get('/users.lookupByEmail', { params: { email } })
        if (res.data.ok && res.data.user?.id) return res.data.user.id
        logger.info({ email, error: res.data.error }, 'Slack: user not found by email (expected mismatch)')
        return null
    } catch (err: any) {
        logger.warn({ email, error: err.message }, 'Slack: users.lookupByEmail threw')
        return null
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure Block Kit builder functions (no network calls, no side effects)
// Independently unit-testable — assert on exact JSON shape without mocking HTTP.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build Block Kit payload for a meeting summary posted to a channel.
 * Includes: header, divider, commitment list, divider, "View Full Summary" CTA button.
 */
export function buildMeetingSummaryBlocks(
    meeting: { id: string; title: string; scheduledAt?: Date | null },
    counts: { commitments: number; actionItems: number },
    commitments: Array<{ text: string; ownerEmail?: string | null; dueDate?: Date | null }>
): SlackBlock[] {
    const frontendUrl = env.FRONTEND_URL || 'http://localhost:3000'

    const commitmentItems = commitments.slice(0, 10).map((c) => {
        const due = c.dueDate ? `  _(due ${c.dueDate.toLocaleDateString()})_` : ''
        const owner = c.ownerEmail ? `  •  ${c.ownerEmail}` : ''
        return {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `• ${c.text}${owner}${due}`,
            },
        }
    })

    return [
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: `📋  ${meeting.title}`,
                emoji: true,
            },
        },
        { type: 'divider' },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `*${counts.commitments} commitment${counts.commitments !== 1 ? 's' : ''}*  ·  *${counts.actionItems} action item${counts.actionItems !== 1 ? 's' : ''}*`,
            },
        },
        ...(commitmentItems.length > 0 ? commitmentItems : [{
            type: 'section',
            text: { type: 'mrkdwn', text: '_No commitments recorded._' },
        }]),
        { type: 'divider' },
        {
            type: 'actions',
            elements: [
                {
                    type: 'button',
                    text: { type: 'plain_text', text: 'View Full Summary', emoji: true },
                    url: `${frontendUrl}/meetings/${meeting.id}`,
                    action_id: 'view_summary',
                    style: 'primary',
                },
            ],
        },
    ]
}

/**
 * Build Block Kit payload for a "commitment missed" DM.
 * Shorter and more direct than the channel version.
 */
export function buildCommitmentMissedBlocks(
    commitment: { id: string; text: string; dueDate?: Date | null }
): SlackBlock[] {
    const frontendUrl = env.FRONTEND_URL || 'http://localhost:3000'
    return [
        {
            type: 'header',
            text: { type: 'plain_text', text: '⚠️  Missed Commitment', emoji: true },
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `You missed the deadline for:\n*${commitment.text}*${commitment.dueDate ? `\n_Due: ${commitment.dueDate.toLocaleDateString()}_` : ''}`,
            },
        },
        {
            type: 'actions',
            elements: [
                {
                    type: 'button',
                    text: { type: 'plain_text', text: 'Update Status', emoji: true },
                    value: commitment.id,
                    action_id: 'mark_fulfilled',
                },
            ],
        },
    ]
}

/**
 * Build Block Kit payload for a "deadline reminder" DM.
 */
export function buildDeadlineReminderBlocks(
    commitment: { id: string; text: string; dueDate?: Date | null }
): SlackBlock[] {
    const frontendUrl = env.FRONTEND_URL || 'http://localhost:3000'
    return [
        {
            type: 'header',
            text: { type: 'plain_text', text: '⏰  Deadline Reminder', emoji: true },
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `Upcoming commitment:\n*${commitment.text}*${commitment.dueDate ? `\n_Due: ${commitment.dueDate.toLocaleDateString()}_` : ''}`,
            },
        },
        {
            type: 'actions',
            elements: [
                {
                    type: 'button',
                    text: { type: 'plain_text', text: 'Mark Fulfilled', emoji: true },
                    value: commitment.id,
                    action_id: 'mark_fulfilled',
                    style: 'primary',
                },
            ],
        },
    ]
}

// ─────────────────────────────────────────────────────────────────────────────
// SlackProvider — implements the shared IntegrationProvider contract
// ─────────────────────────────────────────────────────────────────────────────

export class SlackProvider implements IntegrationProvider {

    // ── SharedInterface: OAuth exchange ──────────────────────────────────────

    async exchangeCodeForTokens(code: string): Promise<ProviderTokenResponse> {
        const config = OAUTH_CONFIGS.SLACK!

        // Slack uses Basic auth (client_id:client_secret) for token exchange
        const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')

        const response = await axios.post(
            config.tokenUrl,
            new URLSearchParams({
                code,
                redirect_uri: config.callbackUrl,
                grant_type: 'authorization_code',
            }),
            {
                headers: {
                    Authorization: `Basic ${credentials}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                timeout: 10_000,
            }
        )

        const data = response.data
        if (!data.ok) {
            logger.error({ error: data.error }, 'Slack: oauth.v2.access returned ok:false')
            throw new Error(`Slack OAuth failed: ${data.error}`)
        }

        // Bot token lives at data.access_token, team info at data.team
        const botToken: string = data.access_token
        const botUserId: string = data.bot_user_id || ''
        const teamId: string = data.team?.id || ''
        const teamName: string = data.team?.name || ''

        const workspaceMeta: SlackWorkspaceMeta = {
            id: teamId,
            name: teamName,
            url: data.incoming_webhook?.configuration_url || undefined,
            extra: { botUserId },
        }

        return {
            accessToken: botToken,
            refreshToken: undefined, // Slack bot tokens don't expire
            expiresIn: undefined,
            workspaceMeta,
        }
    }

    /**
     * Slack bot tokens do NOT expire under normal operation.
     * This is a documented NO-OP satisfying the shared interface contract.
     * The function exists so the shared token-refresh cron can call it safely
     * for ALL providers without special-casing Slack.
     */
    async refreshAccessToken(
        refreshTokenEnc: string
    ): Promise<Omit<ProviderTokenResponse, 'workspaceMeta'>> {
        // No-op: return a sentinel that signals "no rotation needed"
        return {
            accessToken: refreshTokenEnc, // caller should not re-encrypt if this is the same
            refreshToken: undefined,
            expiresIn: undefined,
        }
    }

    // ── SharedInterface: testConnection ──────────────────────────────────────

    async testConnection(integration: TeamIntegration): Promise<ProviderTestResult> {
        try {
            const botToken = decrypt(integration.accessTokenEnc)
            const client = buildSlackClient(botToken)
            const res = await client.get('/auth.test')

            if (res.data.ok) {
                return { healthy: true, workspaceName: integration.workspaceName || undefined }
            }
            logger.warn({ integrationId: integration.id, error: res.data.error }, 'Slack testConnection: ok:false')
            return { healthy: false }
        } catch (err: any) {
            logger.warn({ integrationId: integration.id, error: err.message }, 'Slack testConnection threw')
            return { healthy: false }
        }
    }

    // ── SharedInterface: revokeToken — best-effort, never throws ─────────────

    async revokeToken(integration: TeamIntegration): Promise<void> {
        try {
            const botToken = decrypt(integration.accessTokenEnc)
            const client = buildSlackClient(botToken)
            await client.get('/auth.revoke')
        } catch (err: any) {
            logger.warn({ integrationId: integration.id, error: err.message }, 'Slack revokeToken failed (best-effort)')
        }
    }

    // ── Slack-specific: send meeting summary to channel ──────────────────────

    /**
     * Post a meeting summary to the team's configured Slack channel.
     * If no defaultChannelId is configured → documented no-op (not an error).
     * Rate limiting is handled at the BullMQ queue-limiter level, NOT here.
     */
    async sendMeetingSummaryToChannel(
        integration: TeamIntegration,
        meeting: { id: string; title: string; scheduledAt?: Date | null },
        counts: { commitments: number; actionItems: number },
        commitments: Array<{ text: string; ownerEmail?: string | null; dueDate?: Date | null }>
    ): Promise<SlackSendResult> {
        const meta = integration.metadata as any
        const defaultChannelId: string | undefined = meta?.defaultChannelId

        if (!defaultChannelId) {
            logger.info({ integrationId: integration.id }, 'Slack: no defaultChannelId configured — skipping channel post')
            return { ok: false, error: 'SLACK_CHANNEL_NOT_CONFIGURED' }
        }

        try {
            const botToken = decrypt(integration.accessTokenEnc)
            const client = buildSlackClient(botToken)
            const blocks = buildMeetingSummaryBlocks(meeting, counts, commitments)

            const res = await client.post('/chat.postMessage', {
                channel: defaultChannelId,
                text: `Meeting summary: ${meeting.title}`, // fallback for notifications
                blocks,
            })

            if (!res.data.ok) {
                logger.error({ integrationId: integration.id, error: res.data.error }, 'Slack chat.postMessage failed')
                return { ok: false, error: res.data.error }
            }

            logger.info({ integrationId: integration.id, meetingId: meeting.id, ts: res.data.ts }, 'Slack: meeting summary posted')
            return { ok: true, ts: res.data.ts, channel: res.data.channel }
        } catch (err: any) {
            logger.error({ integrationId: integration.id, error: err.message }, 'Slack sendMeetingSummaryToChannel threw')
            return { ok: false, error: err.message }
        }
    }

    // ── Slack-specific: send "commitment missed" DM ──────────────────────────

    async sendCommitmentMissedDM(
        integration: TeamIntegration,
        ownerEmail: string,
        commitment: { id: string; text: string; dueDate?: Date | null }
    ): Promise<SlackSendResult> {
        try {
            const botToken = decrypt(integration.accessTokenEnc)
            const client = buildSlackClient(botToken)

            const slackUserId = await lookupSlackUserByEmail(client, ownerEmail)
            if (!slackUserId) return { ok: false, error: 'SLACK_USER_NOT_FOUND' }

            const channelId = await openDMChannel(client, slackUserId)
            if (!channelId) return { ok: false, error: 'SLACK_DM_OPEN_FAILED' }

            const blocks = buildCommitmentMissedBlocks(commitment)
            const res = await client.post('/chat.postMessage', {
                channel: channelId,
                text: `⚠️ Missed commitment: ${commitment.text}`,
                blocks,
            })

            if (!res.data.ok) {
                logger.warn({ error: res.data.error, ownerEmail }, 'Slack: DM (missed) failed')
                return { ok: false, error: res.data.error }
            }

            return { ok: true, ts: res.data.ts, channel: channelId }
        } catch (err: any) {
            logger.warn({ error: err.message, ownerEmail }, 'Slack sendCommitmentMissedDM threw (no-op)')
            return { ok: false, error: err.message }
        }
    }

    // ── Slack-specific: send "deadline reminder" DM ──────────────────────────

    async sendDeadlineReminderDM(
        integration: TeamIntegration,
        ownerEmail: string,
        commitment: { id: string; text: string; dueDate?: Date | null }
    ): Promise<SlackSendResult> {
        try {
            const botToken = decrypt(integration.accessTokenEnc)
            const client = buildSlackClient(botToken)

            const slackUserId = await lookupSlackUserByEmail(client, ownerEmail)
            if (!slackUserId) return { ok: false, error: 'SLACK_USER_NOT_FOUND' }

            const channelId = await openDMChannel(client, slackUserId)
            if (!channelId) return { ok: false, error: 'SLACK_DM_OPEN_FAILED' }

            const blocks = buildDeadlineReminderBlocks(commitment)
            const res = await client.post('/chat.postMessage', {
                channel: channelId,
                text: `⏰ Deadline reminder: ${commitment.text}`,
                blocks,
            })

            if (!res.data.ok) {
                logger.warn({ error: res.data.error, ownerEmail }, 'Slack: DM (reminder) failed')
                return { ok: false, error: res.data.error }
            }

            return { ok: true, ts: res.data.ts, channel: channelId }
        } catch (err: any) {
            logger.warn({ error: err.message, ownerEmail }, 'Slack sendDeadlineReminderDM threw (no-op)')
            return { ok: false, error: err.message }
        }
    }
}

export const slackProvider = new SlackProvider()
