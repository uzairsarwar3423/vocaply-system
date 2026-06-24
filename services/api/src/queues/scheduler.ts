// ─────────────────────────────────────────────────────────────────────────────
// scheduler.ts — Cron Job Registrations
//
// Day 22 additions:
//   1. HOURLY calendar sync fan-out ('0 * * * *')
//      — Cron enqueues per-user jobs, does NOT await them inline.
//      — ONE slow user's sync never delays everyone else's.
//   2. EVERY 15 MINUTES token refresh cron ('*/15 * * * *')
//      — Proactively refreshes BOTH team_integrations and user_integrations
//        nearing expiry (within 30 minutes). This is what makes "proactive
//        refresh, never reactive" a real implementation, not just a principle.
//
// SCHEDULE CLARIFICATION:
//   calendar sync  → HOURLY   ('0 * * * *')   — scan for new meetings
//   token refresh  → 15-min   ('*/15 * * * *') — keep tokens alive proactively
// ─────────────────────────────────────────────────────────────────────────────

import cron from 'node-cron'
import { addSeconds } from 'date-fns'
import { logger } from '../config/logger'
import { runDeadlineReminders, markMissedCommitments } from './workers/deadline.worker'
import { calendarSyncQueue, notifyQueue } from './queue.client'
import { prisma } from '../db/client'
import { encrypt } from '../utils/crypto'
import { resolveProvider } from '../modules/integrations/integrations.service'
import { ProviderType } from '../modules/integrations/integrations.types'
import { googleCalendarProvider } from '../modules/integrations/providers/google-calendar.provider'

// ─────────────────────────────────────────────────────────────────────────────
// Token refresh helpers
// ─────────────────────────────────────────────────────────────────────────────

// Unified circuit-breaker threshold — SAME as integrate.worker.ts (line 95).
// 5 consecutive failures of ANY kind disables the integration.
const CIRCUIT_BREAKER_THRESHOLD = 5

async function refreshTeamIntegrations(): Promise<void> {
    const EXPIRY_WINDOW_MS = 30 * 60 * 1000 // 30 minutes

    const expiring = await prisma.teamIntegration.findMany({
        where: {
            isActive: true,
            tokenExpiresAt: { not: null, lte: new Date(Date.now() + EXPIRY_WINDOW_MS) },
        },
    })

    logger.info({ count: expiring.length }, 'token-refresh cron: refreshing team integrations')

    for (const integration of expiring) {
        const start = Date.now()
        try {
            const providerClient = resolveProvider(integration.provider as ProviderType)

            if (!integration.refreshTokenEnc) {
                logger.warn({ integrationId: integration.id, provider: integration.provider }, 'token-refresh: no refresh token — skipping')
                continue
            }

            const result = await providerClient.refreshAccessToken(integration.refreshTokenEnc)

            // Only update if provider returned a meaningful new token
            if (result.accessToken && result.accessToken !== integration.refreshTokenEnc) {
                await prisma.teamIntegration.update({
                    where: { id: integration.id },
                    data: {
                        accessTokenEnc: encrypt(result.accessToken),
                        // Only update refreshToken if provider rotated it (rare)
                        ...(result.refreshToken ? { refreshTokenEnc: encrypt(result.refreshToken) } : {}),
                        tokenExpiresAt: result.expiresIn ? addSeconds(new Date(), result.expiresIn) : null,
                        consecutiveErrors: 0,
                        lastError: null,
                    },
                })
            }

            logger.info(
                { integrationId: integration.id, provider: integration.provider, latencyMs: Date.now() - start },
                'token-refresh: team integration refreshed'
            )

        } catch (err: any) {
            const latencyMs = Date.now() - start
            logger.error(
                { integrationId: integration.id, provider: integration.provider, error: err.message, latencyMs },
                'token-refresh: team integration refresh failed'
            )

            const updated = await prisma.teamIntegration.update({
                where: { id: integration.id },
                data: {
                    consecutiveErrors: { increment: 1 },
                    lastError: err.message,
                },
                select: { consecutiveErrors: true, teamId: true },
            })

            // Circuit breaker — same threshold as integrate.worker.ts
            if (updated.consecutiveErrors >= CIRCUIT_BREAKER_THRESHOLD) {
                await prisma.teamIntegration.update({
                    where: { id: integration.id },
                    data: { isActive: false, disconnectedAt: new Date() },
                })

                await notifyQueue.add('send-notification', {
                    type: 'INTEGRATION_AUTO_DISABLED',
                    teamId: updated.teamId,
                    metadata: { provider: integration.provider, reason: 'token_refresh_failed_5_times' },
                })

                logger.error(
                    { integrationId: integration.id, provider: integration.provider },
                    'token-refresh: circuit breaker tripped — integration disabled, admin alerted'
                )
            }
        }
    }
}

async function refreshUserIntegrations(): Promise<void> {
    const EXPIRY_WINDOW_MS = 30 * 60 * 1000 // 30 minutes

    const expiring = await prisma.userIntegration.findMany({
        where: {
            syncEnabled: true,
            tokenExpiresAt: { not: null, lte: new Date(Date.now() + EXPIRY_WINDOW_MS) },
        },
        include: { user: { select: { id: true, email: true, name: true } } },
    })

    logger.info({ count: expiring.length }, 'token-refresh cron: refreshing user integrations (Google Calendar)')

    for (const integration of expiring) {
        const start = Date.now()
        try {
            if (!integration.refreshTokenEnc) {
                logger.warn({ integrationId: integration.id }, 'token-refresh: user integration has no refresh token — skipping')
                continue
            }

            const result = await googleCalendarProvider.refreshAccessToken(integration.refreshTokenEnc)

            await prisma.userIntegration.update({
                where: { id: integration.id },
                data: {
                    accessTokenEnc: encrypt(result.accessToken),
                    tokenExpiresAt: addSeconds(new Date(), result.expiresIn),
                    consecutiveErrors: 0,
                    lastError: null,
                },
            })

            logger.info(
                { integrationId: integration.id, userId: integration.userId, latencyMs: Date.now() - start },
                'token-refresh: user calendar integration refreshed'
            )

        } catch (err: any) {
            const latencyMs = Date.now() - start
            logger.error(
                { integrationId: integration.id, userId: integration.userId, error: err.message, latencyMs },
                'token-refresh: user integration refresh failed'
            )

            const updated = await prisma.userIntegration.update({
                where: { id: integration.id },
                data: { consecutiveErrors: { increment: 1 }, lastError: err.message },
                select: { consecutiveErrors: true },
            })

            // Circuit breaker — user-level: disable sync + email the individual user
            if (updated.consecutiveErrors >= CIRCUIT_BREAKER_THRESHOLD) {
                await prisma.userIntegration.update({
                    where: { id: integration.id },
                    data: { syncEnabled: false },
                })

                await notifyQueue.add('send-notification', {
                    type: 'CALENDAR_RECONNECT_REQUIRED',
                    teamId: '',
                    metadata: {
                        userId: integration.userId,
                        userEmail: integration.user?.email,
                        userName: integration.user?.name,
                    },
                })

                logger.error(
                    { integrationId: integration.id, userId: integration.userId },
                    'token-refresh: user calendar circuit breaker tripped — sync disabled, user alerted'
                )
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Calendar sync fan-out helper
//
// CRITICAL DESIGN: this cron does NOT call syncUserCalendar() in a loop.
// It ENQUEUES jobs. A slow user's sync never delays everyone else's.
// At scale (10→100,000 users), only worker count and concurrency change.
// ─────────────────────────────────────────────────────────────────────────────

async function enqueueCalendarSyncJobs(): Promise<void> {
    const integrations = await prisma.userIntegration.findMany({
        where: {
            provider: 'GOOGLE_CALENDAR',
            syncEnabled: true,
            // Only sync users who haven't been synced in the last 50 minutes
            // (prevents double-enqueue if previous job is still running)
            OR: [
                { lastSyncedAt: null },
                { lastSyncedAt: { lte: new Date(Date.now() - 50 * 60 * 1000) } },
            ],
        },
        select: { userId: true },
    })

    logger.info({ count: integrations.length }, 'calendar-sync cron: enqueueing per-user jobs')

    for (const { userId } of integrations) {
        await calendarSyncQueue.add(
            'sync-user-calendar',
            { userId },
            {
                // Deterministic jobId prevents duplicate jobs if cron fires early/twice
                jobId: `calendar-sync:${userId}:${Math.floor(Date.now() / (60 * 60 * 1000))}`, // per-hour bucket
                attempts: 3,
                backoff: { type: 'exponential', delay: 30_000 },
            }
        )
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// startScheduler — registers all cron jobs
// ─────────────────────────────────────────────────────────────────────────────

export function startScheduler(): void {

    // ── Day 19: Commitment deadline reminders (9 AM UTC daily) ───────────────
    cron.schedule('0 9 * * *', async () => {
        logger.info('Cron: running deadline reminders')
        try {
            await runDeadlineReminders()
        } catch (err) {
            logger.error({ err }, 'Cron: deadline reminders failed')
        }
    })

    // ── Day 19: Mark missed commitments (6 PM UTC daily) ─────────────────────
    cron.schedule('0 18 * * *', async () => {
        logger.info('Cron: marking missed commitments')
        try {
            await markMissedCommitments()
        } catch (err) {
            logger.error({ err }, 'Cron: mark missed failed')
        }
    })

    // ── Day 19: Weekly digest (Monday 9 AM UTC) ───────────────────────────────
    cron.schedule('0 9 * * 1', async () => {
        logger.info('Cron: sending weekly digest')
        // Full implementation: Day 18 notify.worker
    })

    // ── Day 22: Calendar sync fan-out (HOURLY) ────────────────────────────────
    // DOES NOT await individual syncs — enqueues jobs only. Fast return.
    cron.schedule('0 * * * *', async () => {
        logger.info('Cron: enqueueing calendar sync jobs (hourly)')
        try {
            await enqueueCalendarSyncJobs()
        } catch (err) {
            logger.error({ err }, 'Cron: calendar sync enqueue failed')
        }
    })

    // ── Day 22: Proactive token refresh (EVERY 15 MINUTES) ───────────────────
    // Refreshes tokens for ALL providers nearing expiry.
    // This is what makes "proactive refresh, never reactive" a real guarantee.
    cron.schedule('*/15 * * * *', async () => {
        logger.info('Cron: running proactive token refresh')
        try {
            await Promise.allSettled([
                refreshTeamIntegrations(),
                refreshUserIntegrations(),
            ])
        } catch (err) {
            logger.error({ err }, 'Cron: token refresh cron top-level error')
        }
    })

    logger.info(
        'Scheduler started: deadline-reminder@9AM, mark-missed@6PM, digest@Mon9AM, calendar-sync@hourly, token-refresh@15min'
    )
}
