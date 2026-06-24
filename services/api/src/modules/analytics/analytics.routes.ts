import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.middleware'
import { injectTenant } from '../../middleware/tenant.middleware'
import { validate } from '../../middleware/validate.middleware'
import { analyticsController } from './analytics.controller'
import { dateRangeQuerySchema, trendsQuerySchema } from './analytics.validator'

export const analyticsRouter = Router()

/**
 * GET /api/v1/analytics/overview
 * Any role — service returns identical team-level payload regardless of role.
 */
analyticsRouter.get(
  '/overview',
  requireAuth,
  injectTenant,
  validate({ query: dateRangeQuerySchema }),
  analyticsController.getOverview
)

/**
 * GET /api/v1/analytics/members
 * Any role at route level — DELIBERATE, not an oversight.
 * A MEMBER must be allowed to reach the service to get THEIR OWN row.
 * Role-based data restriction enforced inside analytics.service.getMembers.
 */
analyticsRouter.get(
  '/members',
  requireAuth,
  injectTenant,
  validate({ query: dateRangeQuerySchema }),
  analyticsController.getMembers
)

/**
 * GET /api/v1/analytics/trends
 */
analyticsRouter.get(
  '/trends',
  requireAuth,
  injectTenant,
  validate({ query: trendsQuerySchema }),
  analyticsController.getTrends
)

/**
 * GET /api/v1/analytics/activity
 */
analyticsRouter.get(
  '/activity',
  requireAuth,
  injectTenant,
  analyticsController.getActivity
)
