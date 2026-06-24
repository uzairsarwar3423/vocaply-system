// ─────────────────────────────────────────────────────────────────────────────
// slack.webhook.ts — Slack Interactive Webhook Handler
//
// Handles: Slack user clicking a button in a Block Kit message
// e.g. "Mark Fulfilled" inside a commitment DM → real Vocaply state change.
//
// Architecture principle (from Day 19):
//   ONE business rule, TWO entry points, ZERO logic duplication.
//   The commitment state-change here calls the EXACT same service function
//   the REST PATCH endpoint calls. No business logic lives in this file.
//
// Payload format: Slack sends interactive payloads as
//   application/x-www-form-urlencoded with a `payload` JSON field.
//   NOT a raw JSON body like every other webhook. Isolated entirely here.
//
// Fast-ack: 200 OK is sent BEFORE business logic (identical to Day 18 recall).
//   Slack shows "this action timed out" if response takes > 3s.
//
// Idempotency: keyed on Slack's action_ts (unique per button press invocation).
// ─────────────────────────────────────────────────────────────────────────────

import type { Request, Response } from 'express'
import { verifySlackV0Signature } from './webhooks.validator'
import { redis } from '../../config/redis'
import { prisma } from '../../db/client'
import { logger } from '../../config/logger'
import { env } from '../../config/env'

// ─────────────────────────────────────────────────────────────────────────────
// Commitment status update (imported lazily to avoid circular deps)
// The service is already instantiated by the time this handler runs.
// ─────────────────────────────────────────────────────────────────────────────

async function updateCommitmentStatus(
    commitmentId: string,
    status: string,
    actorUserId: string,
    teamId: string
): Promise<void> {
    const { updateCommitmentStatus: updateFn } = await import('../commitments/commitments.service')
    // Use ADMIN role for Slack-initiated updates — the action was authorized by
    // the Slack workspace admin who configured the integration.
    await updateFn(commitmentId, teamId, actorUserId, 'ADMIN', { status: status as any })
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolve a Slack user.id → Vocaply userId by matching email
// ─────────────────────────────────────────────────────────────────────────────

async function resolveVocaplyUser(
    teamId: string,
    slackEmail: string
): Promise<{ id: string; teamId: string } | null> {
    const user = await prisma.user.findFirst({
        where: { teamId, email: slackEmail },
        select: { id: true, teamId: true },
    })
    if (!user || !user.teamId) return null
    return { id: user.id, teamId: user.teamId }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────

export async function handleSlackWebhook(req: Request, res: Response): Promise<void> {
    const signingSecret = env.SLACK_SIGNING_SECRET

    // ── 1. Signature verification — Slack v0 scheme ──────────────────────────
    if (signingSecret) {
        try {
            verifySlackV0Signature(req, signingSecret)
        } catch (err: any) {
            logger.warn({ error: err.message }, 'Slack webhook: signature verification failed — security event')
            res.status(200).end() // Always 200 to Slack (even for rejected — don't leak info)
            return
        }
    } else {
        logger.warn('Slack webhook: SLACK_SIGNING_SECRET not configured — skipping signature verification (non-prod only)')
    }

    // ── 2. Parse payload — Slack sends as form-urlencoded with a `payload` field
    let payload: any
    try {
        const payloadStr = (req.body as any)?.payload
        if (!payloadStr) {
            logger.warn('Slack webhook: missing payload field')
            res.status(200).end()
            return
        }
        payload = JSON.parse(payloadStr)
    } catch (err: any) {
        logger.warn({ error: err.message }, 'Slack webhook: invalid payload JSON')
        res.status(200).end()
        return
    }

    // ── 3. Fast-ack — BEFORE business logic ─────────────────────────────────
    // Slack enforces a short response-time window. Ack immediately.
    res.status(200).json({ ok: true })

    // ── 4. Idempotency check — keyed on action_ts (unique per button press) ──
    const action = payload.actions?.[0]
    const actionTs: string = action?.action_ts || payload.action_ts || ''
    const idempotencyKey = `webhook:processed:slack:${actionTs}`

    if (actionTs) {
        const already = await redis.set(idempotencyKey, '1', 'EX', 86400, 'NX') // 24h TTL
        if (!already) {
            logger.info({ actionTs }, 'Slack webhook: duplicate action_ts — already processed, skipping')
            return
        }
    }

    // ── 5. Extract action details ─────────────────────────────────────────────
    const actionId: string = action?.action_id || ''
    const commitmentId: string = action?.value || ''
    const slackUserId: string = payload.user?.id || ''
    const slackUserEmail: string = payload.user?.email || ''
    const teamId: string = payload.team?.id || ''
    const responseUrl: string = payload.response_url || ''

    logger.info({ actionId, commitmentId, slackUserId, actionTs }, 'Slack webhook: processing interactive action')

    // ── 6. Resolve Vocaply teamId from Slack teamId ──────────────────────────
    const integration = await prisma.teamIntegration.findFirst({
        where: { workspaceId: teamId, provider: 'SLACK', isActive: true },
        select: { teamId: true },
    })

    if (!integration) {
        logger.warn({ slackTeamId: teamId }, 'Slack webhook: no active integration found for Slack team')
        return
    }

    const vocaplyTeamId = integration.teamId

    // ── 7. Resolve actor (Slack user → Vocaply user) ──────────────────────────
    // Note: payload.user.email is only present if users:read.email scope was granted
    let actorUser: { id: string; teamId: string } | null = null
    if (slackUserEmail) {
        actorUser = await resolveVocaplyUser(vocaplyTeamId, slackUserEmail)
    }

    if (!actorUser && slackUserId) {
        // Fallback: use first team admin if actor can't be resolved
        actorUser = await prisma.user.findFirst({
            where: { teamId: vocaplyTeamId, role: { in: ['OWNER', 'ADMIN'] } },
            select: { id: true, teamId: true },
        }) as any
    }

    if (!actorUser) {
        logger.warn({ slackUserId, slackUserEmail }, 'Slack webhook: could not resolve actor to Vocaply user — skipping')
        return
    }

    // ── 8. Dispatch on action_id ──────────────────────────────────────────────
    try {
        switch (actionId) {
            case 'mark_fulfilled':
                if (!commitmentId) {
                    logger.warn({ actionId }, 'Slack webhook: mark_fulfilled missing commitmentId in value')
                    break
                }
                await updateCommitmentStatus(commitmentId, 'FULFILLED', actorUser.id, vocaplyTeamId)
                logger.info({ commitmentId, actorUserId: actorUser.id }, 'Slack webhook: commitment marked fulfilled via button')

                // Optionally update the original message in-place (UX nicety)
                if (responseUrl) {
                    await sendResponseUrlUpdate(responseUrl, '✅ Marked as fulfilled').catch(err => {
                        logger.warn({ error: err.message }, 'Slack webhook: response_url update failed (non-fatal)')
                    })
                }
                break

            case 'defer':
                // Future enhancement — the case exists so adding it later is additive, not a rewrite.
                logger.info({ commitmentId }, 'Slack webhook: defer action received (not yet implemented)')
                break

            case 'view_summary':
                // Button click that opens a URL — Slack handles the redirect.
                // No server-side action needed.
                break

            default:
                logger.warn({ actionId }, 'Slack webhook: unrecognized action_id')
        }
    } catch (err: any) {
        logger.error({ actionId, commitmentId, error: err.message }, 'Slack webhook: action processing failed')
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Update original Slack message via response_url (UX nicety)
// ─────────────────────────────────────────────────────────────────────────────

async function sendResponseUrlUpdate(responseUrl: string, text: string): Promise<void> {
    const { default: axios } = await import('axios')
    await axios.post(responseUrl, {
        text,
        replace_original: true,
        response_type: 'ephemeral',
    }, { timeout: 5_000 })
}
