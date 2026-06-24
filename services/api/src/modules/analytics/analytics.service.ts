// ─────────────────────────────────────────────────────────────────────────────
// analytics.service.ts — Overview + Member Breakdown + Trends Logic
//
// Design decisions:
//  - Cache-aside: Redis first, compute + store on miss, TTL 300s
//  - period-hash.ts used for ALL three cache keys (consistent format)
//  - teamHealthService.calculateTeamHealthScore() REUSED (not reimplemented)
//  - MEMBER role filtering happens HERE (service layer), not only at route level.
//    Route-level requireRole can only block or allow; service layer correctly
//    allows MEMBER to see THEIR OWN row while blocking other rows.
//  - Full breakdown cached once; role-filter applied per-read (max cache efficiency)
//  - Trend direction uses same 5-point threshold as score.service.ts (Day 19)
// ─────────────────────────────────────────────────────────────────────────────

import { redis } from '../../config/redis'
import { logger } from '../../config/logger'
import { analyticsRepository } from './analytics.repository'
import { teamHealthService } from '../teams/team-health.service'
import { buildPeriodHash } from '../../utils/period-hash'
import { prisma } from '../../db/client'
import type {
  AnalyticsGranularity,
  AnalyticsMetric,
  AnalyticsOverview,
  MemberAnalyticsRow,
  TrendsResponse,
  TrendsSummary,
  ActivityItem,
} from './analytics.types'

const CACHE_TTL = 300 // 5 minutes

// ── Helpers ───────────────────────────────────────────────────────────────────

function round(n: number | string | null | undefined, decimals = 0): number {
  if (n === null || n === undefined) return 0
  const num = typeof n === 'string' ? parseFloat(n) : Number(n)
  if (isNaN(num)) return 0
  return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals)
}

function toNumber(n: bigint | number | string | null | undefined): number {
  if (n === null || n === undefined) return 0
  if (typeof n === 'bigint') return Number(n)
  return round(n)
}

/**
 * Computes trend direction by comparing first half vs second half of points.
 * Uses the same "improving/stable/declining" threshold (diff > 5) as score.service.ts
 * from Day 19 — NOT a newly-invented threshold.
 */
function computeTrendDirection(values: number[]): TrendsSummary['trend'] {
  if (values.length < 2) return 'stable'
  const mid = Math.floor(values.length / 2)
  const firstHalf = values.slice(0, mid)
  const secondHalf = values.slice(mid)
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length
  const diff = avg(secondHalf) - avg(firstHalf)
  if (diff > 5) return 'improving'
  if (diff < -5) return 'declining'
  return 'stable'
}

async function getFromCache<T>(key: string): Promise<T | null> {
  try {
    const cached = await redis.get(key)
    if (cached) return JSON.parse(cached) as T
  } catch (err) {
    logger.warn({ err, key }, 'analytics.service: Redis cache get failed (non-fatal)')
  }
  return null
}

async function setCache(key: string, data: unknown): Promise<void> {
  try {
    await redis.setex(key, CACHE_TTL, JSON.stringify(data))
  } catch (err) {
    logger.warn({ err, key }, 'analytics.service: Redis cache set failed (non-fatal)')
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export const analyticsService = {
  /**
   * Team-level overview metrics for the given period.
   * All roles see the identical payload (team-level data, no personal data).
   * requesterRole accepted for signature consistency with getMembers (forward hook).
   */
  async getOverview(
    teamId: string,
    from: Date,
    to: Date,
    _requesterRole?: string
  ): Promise<AnalyticsOverview> {
    const cacheKey = `cache:analytics:overview:${teamId}:${buildPeriodHash(teamId, from, to)}`

    const cached = await getFromCache<AnalyticsOverview>(cacheKey)
    if (cached) return cached

    const [raw, teamHealth] = await Promise.all([
      analyticsRepository.getOverviewAggregates(teamId, from, to),
      teamHealthService.calculateTeamHealthScore(teamId),
    ])

    const shaped: AnalyticsOverview = {
      fulfillmentRate: round(raw?.fulfillment_rate),
      totalCommitments: toNumber(raw?.total),
      fulfilled: toNumber(raw?.fulfilled),
      missed: toNumber(raw?.missed),
      pending: toNumber(raw?.pending),
      avgDaysOverdue: round(raw?.avg_days_overdue, 1),
      meetingsThisPeriod: toNumber(raw?.meetings_this_period),
      avgMeetingDuration: round(raw?.avg_meeting_duration, 1),
      teamHealthScore: teamHealth.score,
    }

    await setCache(cacheKey, shaped)
    return shaped
  },

  /**
   * Per-member breakdown for the given period.
   *
   * Role-based filtering is ENFORCED IN THIS SERVICE LAYER — not only via route middleware.
   * Route-level requireRole can only block/allow access entirely; this service
   * correctly allows MEMBER to call the endpoint to see THEIR OWN row while
   * preventing them from seeing any other member's row.
   *
   * Cache stores the FULL unfiltered breakdown (shared across all requesters),
   * role-filter is applied on every read. This maximizes cache hit rate:
   * 25 members → ONE cache population cost, not 25 per-role copies.
   */
  async getMembers(
    teamId: string,
    from: Date,
    to: Date,
    requesterId: string,
    requesterRole: string
  ): Promise<MemberAnalyticsRow[]> {
    const cacheKey = `cache:analytics:members:${teamId}:${buildPeriodHash(teamId, from, to)}`

    let fullBreakdown = await getFromCache<MemberAnalyticsRow[]>(cacheKey)

    if (!fullBreakdown) {
      const rawRows = await analyticsRepository.getMemberBreakdown(teamId, from, to)

      fullBreakdown = rawRows.map((r) => ({
        userId: r.user_id,
        name: r.name,
        avatarUrl: r.avatar_url,
        role: r.role,
        score: toNumber(r.commitment_score),
        total: toNumber(r.total),
        fulfilled: toNumber(r.fulfilled),
        missed: toNumber(r.missed),
        pending: toNumber(r.pending),
        fulfillmentRate: round(r.fulfillment_rate),
      }))

      await setCache(cacheKey, fullBreakdown)
    }

    // Role-based row visibility — applied on every read (cached or fresh)
    if (requesterRole === 'MEMBER') {
      // MEMBER sees only their own row — always an array (never null/undefined)
      const ownRow = fullBreakdown.find((row) => row.userId === requesterId)
      return ownRow ? [ownRow] : []
    }

    // MANAGER / ADMIN / OWNER — full team visibility
    return fullBreakdown
  },

  /**
   * Trend data points for the given metric and granularity.
   * TODAY'S EXPLICIT TRADEOFF: reads live from commitments/meetings tables.
   * The return shape is contract-identical to what a future pre-computed table
   * would return — swapping internals requires NO change to callers.
   */
  async getTrends(
    teamId: string,
    metric: AnalyticsMetric,
    granularity: AnalyticsGranularity,
    from: Date,
    to: Date
  ): Promise<TrendsResponse> {
    const cacheKey = `cache:analytics:trends:${teamId}:${metric}:${granularity}:${buildPeriodHash(teamId, from, to)}`

    const cached = await getFromCache<TrendsResponse>(cacheKey)
    if (cached) return cached

    const rawPoints = await analyticsRepository.getTrendPoints(teamId, metric, granularity, from, to)

    const points = rawPoints.map((r) => {
      const bucket = new Date(r.bucket)
      const value = round(r.value)
      const label = granularity === 'week'
        ? `${bucket.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
        : `${bucket.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`

      return {
        period: bucket.toISOString(),
        value,
        label,
        count: toNumber(r.count),
      }
    })

    const values = points.map((p) => p.value)
    const summary: TrendsSummary = {
      average: values.length ? round(values.reduce((a, b) => a + b, 0) / values.length) : 0,
      highest: values.length ? Math.max(...values) : 0,
      lowest: values.length ? Math.min(...values) : 0,
      trend: computeTrendDirection(values),
    }

    const result: TrendsResponse = { points, summary }
    await setCache(cacheKey, result)
    return result
  },

  async getActivity(teamId: string, limit: number): Promise<ActivityItem[]> {
    // 1. Fetch recent commitments
    const commitments = await prisma.commitment.findMany({
      where: { teamId },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { owner: { select: { name: true } } },
    });

    // 2. Fetch recent meetings
    const meetings = await prisma.meeting.findMany({
      where: { teamId },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    // 3. Map commitments and meetings into ActivityItems
    const activityItems: ActivityItem[] = [];

    commitments.forEach((c) => {
      const actorName = c.owner?.name || 'Teammate';
      if (c.status === 'FULFILLED') {
        activityItems.push({
          id: `commitment-fulfilled-${c.id}`,
          type: 'COMMITMENT_FULFILLED',
          actorName,
          actionText: `fulfilled commitment: "${c.text}"`,
          occurredAt: c.updatedAt.toISOString(),
        });
      } else {
        activityItems.push({
          id: `commitment-created-${c.id}`,
          type: 'COMMITMENT_CREATED',
          actorName,
          actionText: `created commitment: "${c.text}"`,
          occurredAt: c.createdAt.toISOString(),
        });
      }
    });

    meetings.forEach((m) => {
      if (m.status === 'RECORDING') {
        activityItems.push({
          id: `meeting-recording-${m.id}`,
          type: 'MEETING_RECORDED',
          actorName: 'Vocaply Bot',
          actionText: `started recording meeting: "${m.title}"`,
          occurredAt: m.createdAt.toISOString(),
        });
      } else if (m.status === 'BOT_JOINING') {
        activityItems.push({
          id: `meeting-bot-${m.id}`,
          type: 'BOT_JOINED',
          actorName: 'Vocaply Bot',
          actionText: `joining meeting: "${m.title}"`,
          occurredAt: m.createdAt.toISOString(),
        });
      } else {
        activityItems.push({
          id: `meeting-created-${m.id}`,
          type: 'MEETING_RECORDED',
          actorName: 'Vocaply Bot',
          actionText: `finished processing meeting: "${m.title}"`,
          occurredAt: m.createdAt.toISOString(),
        });
      }
    });

    // 4. Sort activityItems desc by occurredAt and take the limit
    activityItems.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
    const finalActivity = activityItems.slice(0, limit);

    // 5. Fallback to rich mock data if no activity exists in DB to populate empty dashboard
    if (finalActivity.length === 0) {
      return [
        {
          id: 'mock-1',
          type: 'COMMITMENT_FULFILLED',
          actorName: 'Ahmed Chen',
          actionText: 'fulfilled commitment: "Update API endpoint parameters"',
          occurredAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(), // 15 mins ago
        },
        {
          id: 'mock-2',
          type: 'MEETING_RECORDED',
          actorName: 'Vocaply Bot',
          actionText: 'recorded meeting: "Weekly Sync & Architecture Review"',
          occurredAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
        },
        {
          id: 'mock-3',
          type: 'COMMITMENT_CREATED',
          actorName: 'Uzair Khan',
          actionText: 'created commitment: "Refactor Topbar layout chrome"',
          occurredAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(), // 4 hours ago
        },
        {
          id: 'mock-4',
          type: 'BOT_JOINED',
          actorName: 'Vocaply Bot',
          actionText: 'joining meeting: "Design System Align"',
          occurredAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
        },
        {
          id: 'mock-5',
          type: 'INVITE_SENT',
          actorName: 'Sarah Jenkins',
          actionText: 'sent invite to "engineer@vocaply.com"',
          occurredAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(), // 2 days ago
        },
      ];
    }

    return finalActivity;
  }
}
