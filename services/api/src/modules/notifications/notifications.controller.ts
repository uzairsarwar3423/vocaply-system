import type { Request, Response, NextFunction } from 'express'
import { asyncHandler } from '../../utils/async-handler'
import { notificationsService } from './notifications.service'

export const notificationsController = {
  /**
   * GET /api/v1/notifications/preferences
   * Returns user's notification preferences (or defaults if no row exists).
   * Pure read — never writes to DB on a miss.
   */
  getPreferences: asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = req.user!.id

    const preferences = await notificationsService.getPreferences(userId)

    return res.json({ data: { preferences } })
  }),

  /**
   * PATCH /api/v1/notifications/preferences
   * Partially updates notification preferences (deep merge).
   * Unknown keys rejected with 422 (via validator middleware).
   */
  updatePreferences: asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = req.user!.id
    const partialUpdate = req.body

    const preferences = await notificationsService.updatePreferences(userId, partialUpdate)

    return res.json({ data: { preferences } })
  }),

  /**
   * POST /api/v1/notifications/test
   * Sends a real test notification via the specified channel.
   * Returns { sent: false, reason } as 200 for graceful non-error states.
   */
  testNotification: asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = req.user!.id
    const teamId = req.user!.teamId!
    const { channel, type } = req.body

    const result = await notificationsService.sendTestNotification(userId, teamId, { channel, type })

    return res.json({ data: result })
  }),
}
