import type { Request, Response, NextFunction } from 'express'
import { asyncHandler } from '../../utils/async-handler'
import { analyticsService } from './analytics.service'
import type { AnalyticsGranularity, AnalyticsMetric } from './analytics.types'

// ── Date range helpers ────────────────────────────────────────────────────────

function parseDateRange(query: Record<string, unknown>): { from: Date; to: Date } {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const from = query.from ? new Date(query.from as string) : startOfMonth
  const to = query.to ? new Date(query.to as string) : now

  return { from, to }
}

// ── Controller ────────────────────────────────────────────────────────────────

export const analyticsController = {
  /**
   * GET /api/v1/analytics/overview
   * Team-level overview — all roles see identical payload.
   */
  getOverview: asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const teamId = req.user!.teamId!
    const role = req.user!.role
    const { from, to } = parseDateRange(req.query as any)

    const overview = await analyticsService.getOverview(teamId, from, to, role)

    return res.json({ data: { overview } })
  }),

  /**
   * GET /api/v1/analytics/members
   * MEMBER: receives single-element array (own row only).
   * MANAGER/ADMIN/OWNER: receives full team breakdown.
   * Role filtering enforced in service layer — not just here.
   */
  getMembers: asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const teamId = req.user!.teamId!
    const requesterId = req.user!.id
    const requesterRole = req.user!.role
    const { from, to } = parseDateRange(req.query as any)

    const members = await analyticsService.getMembers(teamId, from, to, requesterId, requesterRole)

    return res.json({ data: { members } })
  }),

  /**
   * GET /api/v1/analytics/trends
   * Trend points bucketed by week or month.
   */
  getTrends: asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const teamId = req.user!.teamId!
    const { from, to } = parseDateRange(req.query as any)
    const metric = (req.query.metric as AnalyticsMetric) || 'fulfillmentRate'
    const granularity = (req.query.granularity as AnalyticsGranularity) || 'week'

    const trends = await analyticsService.getTrends(teamId, metric, granularity, from, to)

    return res.json({ data: trends })
  }),

  getActivity: asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const teamId = req.user!.teamId!
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10

    const activity = await analyticsService.getActivity(teamId, limit)

    return res.json({ data: activity })
  }),
}
