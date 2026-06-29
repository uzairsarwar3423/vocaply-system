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
   * GET /api/v1/notifications/in-app
   * Returns cursor-paginated in-app notifications for the user.
   */
  listInApp: asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = req.user!.id
    const { limit, cursor } = req.query as any

    const result = await notificationsService.listInApp(userId, { limit, cursor })
    return res.json({ data: result })
  }),

  /**
   * GET /api/v1/notifications/unread-count
   * Returns the count of unread in-app notifications.
   */
  getUnreadCount: asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = req.user!.id
    const count = await notificationsService.getUnreadCount(userId)
    return res.json({ data: { count } })
  }),

  /**
   * PATCH /api/v1/notifications/in-app/:id/read
   * Marks a single in-app notification as read.
   */
  markRead: asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = req.user!.id
    const id = req.params.id as string

    await notificationsService.markRead(userId, id)
    return res.json({ data: { success: true } })
  }),

  /**
   * POST /api/v1/notifications/in-app/read-all
   * Marks all in-app notifications for the user as read.
   */
  markAllRead: asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = req.user!.id

    await notificationsService.markAllRead(userId)
    return res.json({ data: { success: true } })
  }),
}
