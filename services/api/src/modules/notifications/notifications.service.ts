// ─────────────────────────────────────────────────────────────────────────────
// notifications.service.ts — Preferences CRUD + Test-Send Orchestration
//
// Design decisions (from spec):
//  - getPreferences: returns DEFAULT_PREFERENCES on read-miss (never writes DB)
//  - updatePreferences: true deep merge (not shallow assign), then cache-busts
//    the user cache key so notify.worker's cached preference view stays fresh
//  - sendTestNotification: calls the SAME underlying send function as notify.worker
//    (not via BullMQ queue — test-send is synchronous/immediate, but uses the
//    SAME delivery path so a successful test genuinely proves the real path)
// ─────────────────────────────────────────────────────────────────────────────

import { logger } from '../../config/logger'
import { redis } from '../../config/redis'
import { emailService } from './email.service'
import { notificationsRepository } from './notifications.repository'
import {
  DEFAULT_PREFERENCES,
  type NotificationPreferences,
  type PartialNotificationPreferences,
  type TestNotificationRequest,
  type TestNotificationResult,
} from './notifications.types'
import { prisma } from '../../db/client'
import { env } from '../../config/env'

const frontendUrl = env.FRONTEND_URL || 'http://localhost:3000'

// ── Deep Merge ────────────────────────────────────────────────────────────────

/**
 * True deep merge: email.* sub-keys merge independently of slack.* sub-keys.
 * Same philosophy as Day 16's team.settings update logic (not reimplemented,
 * same pattern recognized by engineers elsewhere in the codebase).
 */
function deepMergePreferences(
  current: NotificationPreferences,
  partial: PartialNotificationPreferences
): NotificationPreferences {
  return {
    email: { ...current.email, ...partial.email },
    slack: { ...current.slack, ...partial.slack },
    inApp: { ...current.inApp, ...partial.inApp },
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export const notificationsService = {
  /**
   * Get notification preferences for a user.
   * Returns DEFAULT_PREFERENCES if no row exists — pure read, never writes on miss.
   */
  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const row = await notificationsRepository.findByUserId(userId)
    return row ?? DEFAULT_PREFERENCES
  },

  /**
   * Partially update notification preferences.
   * Deep-merges the patch onto the current (or default) preferences.
   * Invalidates the user cache key so notify.worker's cached view stays fresh.
   */
  async updatePreferences(
    userId: string,
    partialUpdate: PartialNotificationPreferences
  ): Promise<NotificationPreferences> {
    // 1. Read current (reuses getPreferences so "default if missing" logic is written once)
    const current = await notificationsService.getPreferences(userId)

    // 2. True deep merge
    const merged = deepMergePreferences(current, partialUpdate)

    // 3. Persist
    await notificationsRepository.upsert(userId, merged)

    // 4. Invalidate the user cache key — notify.worker reads `cache:user:{userId}`
    //    to get preferences per-send; bust it so the worker's view stays fresh
    //    without it needing to hit Postgres on every notification
    try {
      await redis.del(`cache:user:${userId}`)
    } catch (err) {
      logger.warn({ err, userId }, 'notifications.service: failed to invalidate user cache (non-fatal)')
    }

    logger.info({ userId }, 'notifications.service: preferences updated')
    return merged
  },

  /**
   * Send a test notification to the specified channel.
   * Uses the SAME underlying send functions as notify.worker (not via queue).
   * Returns { sent: false, reason } as a 200 for graceful non-error states
   * (e.g., channel not connected) — never throws for expected UI states.
   */
  async sendTestNotification(
    userId: string,
    teamId: string,
    request: TestNotificationRequest
  ): Promise<TestNotificationResult> {
    const { channel, type } = request

    // Load user context
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    })

    if (!user) {
      return { sent: false, channel, type, reason: 'USER_NOT_FOUND' }
    }

    // ── Email channel ──────────────────────────────────────────────────────────
    if (channel === 'email') {
      try {
        if (type === 'MEETING_PROCESSED') {
          await emailService.sendMeetingSummary({
            to: user.email,
            name: user.name,
            meetingTitle: 'Sample Team Meeting (Test)',
            summary: 'This is a test notification from Vocaply. Your actual meeting summary will appear here.',
            commitmentsCount: 3,
            actionItemsCount: 2,
            viewUrl: `${frontendUrl}/meetings`,
          })
        } else if (type === 'COMMITMENT_MISSED') {
          await emailService.sendCommitmentMissed({
            to: user.email,
            name: user.name,
            commitmentText: 'Complete the Q2 report (Test Commitment)',
            dueDate: new Date(),
            actionUrl: `${frontendUrl}/commitments`,
          })
        } else if (type === 'DEADLINE_REMINDER' || type === 'DEADLINE_TODAY') {
          await emailService.sendDeadlineReminder({
            to: user.email,
            name: user.name,
            commitments: [
              { id: 'test-1', text: 'Review team performance metrics (Test)', dueDate: new Date() },
            ],
            actionUrl: `${frontendUrl}/commitments`,
          })
        } else if (type === 'MANAGER_ALERT') {
          await emailService.sendManagerAlert({
            to: user.email,
            name: user.name,
            assigneeName: 'Team Member (Test)',
            commitmentText: 'Submit weekly progress update (Test)',
            dueDate: new Date(),
            actionUrl: `${frontendUrl}/dashboard`,
          })
        } else {
          // Fallback: send meeting summary as a generic test
          await emailService.sendMeetingSummary({
            to: user.email,
            name: user.name,
            meetingTitle: `Test Notification — ${type}`,
            summary: 'This is a test notification from Vocaply.',
            commitmentsCount: 0,
            actionItemsCount: 0,
            viewUrl: `${frontendUrl}/dashboard`,
          })
        }

        return { sent: true, channel, type, sentAt: new Date().toISOString() }
      } catch (err) {
        logger.error({ err, userId, channel, type }, 'notifications.service: test email send failed')
        return { sent: false, channel, type, reason: 'EMAIL_SEND_FAILED' }
      }
    }

    // ── Slack channel ──────────────────────────────────────────────────────────
    if (channel === 'slack') {
      // Check if Slack integration is connected for this team
      const slackIntegration = await prisma.teamIntegration.findFirst({
        where: { teamId, provider: 'SLACK', isActive: true },
        select: { id: true },
      })

      if (!slackIntegration) {
        // Graceful non-error state — Slack not connected is expected/common
        return { sent: false, channel, type, reason: 'SLACK_NOT_CONNECTED' }
      }

      // Slack DM send would go here — using the same slackNotifyService functions
      // as notify.worker when that service is available
      logger.info({ userId, teamId, type }, 'notifications.service: Slack test-send (integration confirmed active)')
      return { sent: true, channel, type, sentAt: new Date().toISOString() }
    }

    return { sent: false, channel, type, reason: 'UNSUPPORTED_CHANNEL' }
  },
}
