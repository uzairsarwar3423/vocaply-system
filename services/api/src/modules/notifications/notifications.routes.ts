import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.middleware'
import { injectTenant } from '../../middleware/tenant.middleware'
import { validate } from '../../middleware/validate.middleware'
import { createRateLimiter } from '../../middleware/rate-limit.middleware'
import { notificationsController } from './notifications.controller'
import { updatePreferencesSchema, testNotificationSchema } from './notifications.validator'

// Test-send rate limiter: 3 requests per 60 seconds per userId.
// Protects external-provider quota (real email via Brevo, real Slack message) —
// not just compute cost. A user repeatedly clicking "test" should not be able
// to spam a Slack channel or burn email quota at zero cost to them.
const testNotificationRateLimiter = createRateLimiter({
  limit: 3,
  windowSeconds: 60,
  keyPrefix: 'ratelimit:test-notification',
  identifier: (req) => req.user?.id ?? null,
})

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
 * POST /api/v1/notifications/test
 * injectTenant required — Slack test needs to know WHICH team's integration to use.
 */
notificationsRouter.post(
  '/test',
  requireAuth,
  injectTenant,
  testNotificationRateLimiter,
  validate({ body: testNotificationSchema }),
  notificationsController.testNotification
)
