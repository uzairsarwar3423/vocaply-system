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
   * List user's in-app notifications with cursor-based pagination.
   */
  async listInApp(userId: string, query: { limit: number; cursor?: string }) {
    const limit = query.limit
    const cursor = query.cursor ? { id: query.cursor } : undefined

    const items = await prisma.inAppNotification.findMany({
      where: { userId },
      take: limit + 1,
      ...(cursor && { cursor, skip: 1 }),
      orderBy: { createdAt: 'desc' },
    })

    let nextCursor: string | undefined = undefined
    if (items.length > limit) {
      const nextItem = items.pop()
      nextCursor = nextItem?.id
    }

    return { items, nextCursor }
  },

  /**
   * Get total count of unread in-app notifications.
   */
  async getUnreadCount(userId: string): Promise<number> {
    return prisma.inAppNotification.count({
      where: { userId, isRead: false },
    })
  },

  /**
   * Mark a single in-app notification as read.
   */
  async markRead(userId: string, id: string): Promise<void> {
    const notification = await prisma.inAppNotification.findFirst({
      where: { id, userId },
    })
    if (!notification) return

    await prisma.inAppNotification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    })

    try {
      const { socketEmitter } = await import('../../realtime/socket.emitter')
      const { userRoom } = await import('../../realtime/rooms.manager')
      const { SERVER_EVENTS } = await import('../../realtime/socket.events')
      socketEmitter.to(userRoom(userId)).emit(SERVER_EVENTS.NOTIFICATION_READ, { id })
    } catch (err) {
      logger.error({ err, userId }, 'notifications.service: failed to emit notification:read socket event')
    }
  },

  /**
   * Mark all unread in-app notifications as read for a user.
   */
  async markAllRead(userId: string): Promise<void> {
    await prisma.inAppNotification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    })

    try {
      const { socketEmitter } = await import('../../realtime/socket.emitter')
      const { userRoom } = await import('../../realtime/rooms.manager')
      const { SERVER_EVENTS } = await import('../../realtime/socket.events')
      socketEmitter.to(userRoom(userId)).emit(SERVER_EVENTS.NOTIFICATION_READ, { all: true })
    } catch (err) {
      logger.error({ err, userId }, 'notifications.service: failed to emit notification:read socket event')
    }
  },
}
