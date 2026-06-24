// ─────────────────────────────────────────────────────────────────────────────
// notifications.repository.ts — DB layer ONLY
//
// Zero business logic. All queries target notification_preferences table only.
// The SERVICE decides what to do with null (return default, never write on read).
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from '../../db/client'
import type { NotificationPreferences } from './notifications.types'

export const notificationsRepository = {
  /**
   * Returns null if no row exists for this userId — the SERVICE handles null
   * (returns DEFAULT_PREFERENCES); the repository just reports ground truth.
   */
  async findByUserId(userId: string): Promise<NotificationPreferences | null> {
    const row = await prisma.notificationPreference.findUnique({
      where: { userId },
    })

    if (!row || !row.preferences) return null

    return row.preferences as unknown as NotificationPreferences
  },

  /**
   * Single upsert — create with full shape if absent, update if present.
   * The MERGE itself happens in the service; this function receives an already-merged object.
   */
  async upsert(userId: string, preferences: NotificationPreferences): Promise<NotificationPreferences> {
    const row = await prisma.notificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        preferences: preferences as any,
      },
      update: {
        preferences: preferences as any,
        updatedAt: new Date(),
      },
    })

    return row.preferences as unknown as NotificationPreferences
  },
}
