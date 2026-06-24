// ─────────────────────────────────────────────────────────────────────────────
// calendar-sync.worker.ts — Calendar Sync BullMQ Worker
//
// Concurrency: 10 — HIGH relative to transcribe/extract workers.
//   This work is I/O-bound (waiting on Google's API) and cheap per-job.
//   Many can run concurrently without resource contention, unlike CPU/AI-bound
//   work which needs lower concurrency.
//
// Error classification:
//   NON-RETRYABLE (mark integration inactive immediately):
//     - 401/invalid_grant from Google (only user reconnect fixes this)
//   RETRYABLE (normal Bull backoff):
//     - Network timeout, 5xx from Google, 429 (quota rate-limit)
// ─────────────────────────────────────────────────────────────────────────────

import { Worker, Job, UnrecoverableError } from 'bullmq'
import { logger } from '../../config/logger'
import { prisma } from '../../db/client'
import { syncUserCalendar } from '../../services/calendar-sync.service'
import { notifyQueue } from '../queue.client'
import type { CalendarSyncJobData } from '../jobs/calendar-sync.job'

const connection = {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD,
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isRevokedTokenError(err: any): boolean {
    // Google returns 401 with error.error === 'invalid_grant' for revoked tokens
    const status = err.response?.status || err.status
    const errorCode = err.response?.data?.error || err.message || ''
    return (
        status === 401 ||
        String(errorCode).toLowerCase().includes('invalid_grant') ||
        String(errorCode).toLowerCase().includes('token has been expired or revoked')
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker
// ─────────────────────────────────────────────────────────────────────────────

export const calendarSyncWorker = new Worker<CalendarSyncJobData>(
    'calendar-sync',
    async (job: Job<CalendarSyncJobData>) => {
        const { userId } = job.data
        logger.debug({ jobId: job.id, userId }, 'calendar-sync.worker: processing job')

        try {
            const result = await syncUserCalendar(userId)

            logger.info(
                { jobId: job.id, userId, synced: result.synced, skipped: result.skipped, duplicates: result.duplicates },
                'calendar-sync.worker: sync complete'
            )

            await job.updateProgress(100)
            return result

        } catch (error: any) {

            // ── Non-retryable: revoked/invalid Google token ──────────────────
            if (isRevokedTokenError(error)) {
                logger.warn(
                    { jobId: job.id, userId, error: error.message },
                    'calendar-sync.worker: Google token revoked — disabling sync, alerting user'
                )

                // Disable sync for this user so the cron stops enqueuing jobs
                try {
                    await prisma.userIntegration.updateMany({
                        where: { userId, provider: 'GOOGLE_CALENDAR' },
                        data: { syncEnabled: false, consecutiveErrors: 5, lastError: 'Token revoked' },
                    })

                    // Queue reconnect email to the user
                    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } })
                    if (user) {
                        await notifyQueue.add('send-notification', {
                            type: 'CALENDAR_RECONNECT_REQUIRED',
                            teamId: '', // user-level notification, teamId not applicable
                            metadata: { userId, userEmail: user.email, userName: user.name },
                        })
                    }
                } catch (cleanupErr: any) {
                    logger.error({ userId, error: cleanupErr.message }, 'calendar-sync.worker: failed to cleanup after revoked token')
                }

                // UnrecoverableError = Bull does NOT retry this job
                throw new UnrecoverableError(`Google Calendar token revoked for user ${userId}`)
            }

            // ── Retryable: network error, 5xx, 429 — Bull's normal backoff applies ──
            logger.error(
                { jobId: job.id, userId, error: error.message, attempt: job.attemptsMade },
                'calendar-sync.worker: transient error — will retry'
            )
            throw error
        }
    },
    {
        connection,
        concurrency: parseInt(process.env.WORKER_CONCURRENCY_CALENDAR ?? '10', 10),
    }
)

calendarSyncWorker.on('completed', (job) => {
    logger.info({ jobId: job.id, result: job.returnvalue }, 'calendar-sync.worker: job completed')
})

calendarSyncWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'calendar-sync.worker: job failed')
})
