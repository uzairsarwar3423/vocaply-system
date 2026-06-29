import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.middleware'
import { injectTenant } from '../../middleware/tenant.middleware'
import { validate } from '../../middleware/validate.middleware'
import { notificationsController } from './notifications.controller'
import { updatePreferencesSchema, listInAppNotificationsSchema } from './notifications.validator'

export const notificationsRouter = Router()

/**
 * GET /api/v1/notifications/preferences
 * No injectTenant — preferences are user-scoped, not team-scoped.
 * A user's notification preferences are personal data independent of which
 * team context they're currently in (forward-compatible with future multi-team-membership).
 */
notificationsRouter.get(
  '/preferences',
  requireAuth,
  notificationsController.getPreferences
)

/**
 * PATCH /api/v1/notifications/preferences
 * z.strict() validator rejects unknown keys with 422.
 */
notificationsRouter.patch(
  '/preferences',
  requireAuth,
  validate({ body: updatePreferencesSchema }),
  notificationsController.updatePreferences
)

/**
 * GET /api/v1/notifications/in-app
 * Retrieve paginated user-scoped in-app notifications.
 */
notificationsRouter.get(
  '/in-app',
  requireAuth,
  validate({ query: listInAppNotificationsSchema }),
  notificationsController.listInApp
)

/**
 * GET /api/v1/notifications/unread-count
 * Retrieve current unread notification count.
 */
notificationsRouter.get(
  '/unread-count',
  requireAuth,
  notificationsController.getUnreadCount
)

/**
 * PATCH /api/v1/notifications/in-app/:id/read
 * Mark a single in-app notification as read.
 */
notificationsRouter.patch(
  '/in-app/:id/read',
  requireAuth,
  notificationsController.markRead
)

/**
 * POST /api/v1/notifications/in-app/read-all
 * Mark all in-app notifications as read for current user.
 */
notificationsRouter.post(
  '/in-app/read-all',
  requireAuth,
  notificationsController.markAllRead
)

