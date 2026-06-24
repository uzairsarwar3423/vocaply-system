// ─────────────────────────────────────────────────────────────────────────────
// team-health.service.ts — Team Health Score Algorithm
//
// Computes a single 0–100 score representing team accountability health.
// Used on: team dashboard, analytics page, weekly digest email.
//
// Formula:
//   score = (fulfillmentRate × 0.6) + (avgMemberScore × 0.3) + (onTimeRate × 0.1)
//
// Weights rationale:
//   60% fulfillment  — Primary: are people keeping promises?
//   30% avg score    — Individual accountability
//   10% on-time rate — Quality: fulfilled on time > fulfilled late
//
// Caching:
//   Key: cache:team:health:{teamId}
//   TTL: 300s (5 minutes)
//   Invalidated: when any commitment changes status in this team
// ─────────────────────────────────────────────────────────────────────────────

import { CommitmentStatus } from '@prisma/client'
import { prisma } from '../../db/client'
import { redis } from '../../config/redis'
import { logger } from '../../config/logger'
import type { TeamHealthScore, HealthTrend } from './teams.types'

// ── Constants ─────────────────────────────────────────────────────────────────

const HEALTH_CACHE_TTL = 300 // 5 minutes
const ANALYSIS_WINDOW_DAYS = 30
const TREND_WINDOW_DAYS = 14
const TREND_THRESHOLD = 5 // points difference to call a trend
const MIN_CONFIDENCE_SCORE = 0.5

function healthCacheKey(teamId: string): string {
  return `cache:team:health:${teamId}`
}

// ── Score Computation ─────────────────────────────────────────────────────────

/**
 * Calculate fulfillment rate for a given date range.
 * Only counts commitments with confidence >= MIN_CONFIDENCE_SCORE.
 */
async function computeFulfillmentRate(
  teamId: string,
  fromDate: Date,
  toDate: Date
): Promise<{ rate: number; fulfilled: number; missed: number; onTimeRate: number }> {
  const commitments = await prisma.commitment.findMany({
    where: {
      teamId,
      createdAt: { gte: fromDate, lt: toDate },
      confidenceScore: { gte: MIN_CONFIDENCE_SCORE },
      status: { in: [CommitmentStatus.FULFILLED, CommitmentStatus.MISSED] },
    },
    select: {
      status: true,
      resolvedAt: true,
      dueDate: true,
    },
  })

  if (commitments.length === 0) {
    return { rate: 0, fulfilled: 0, missed: 0, onTimeRate: 0 }
  }

  const fulfilled = commitments.filter((c) => c.status === CommitmentStatus.FULFILLED)
  const missed = commitments.filter((c) => c.status === CommitmentStatus.MISSED)

  const fulfillmentRate =
    Math.round((fulfilled.length / (fulfilled.length + missed.length)) * 100)

  // On-time: fulfilled before or on the due date
  const fulfilledOnTime = fulfilled.filter((c) => {
    if (!c.dueDate || !c.resolvedAt) return false
    return c.resolvedAt <= c.dueDate
  })

  const onTimeRate =
    fulfilled.length > 0
      ? Math.round((fulfilledOnTime.length / fulfilled.length) * 100)
      : 0

  return {
    rate: fulfillmentRate,
    fulfilled: fulfilled.length,
    missed: missed.length,
    onTimeRate,
  }
}

/**
 * Calculate the average commitment score across all active team members.
 * commitmentScore is a denormalized field on the users table — updated after every status change.
 */
async function computeAvgMemberScore(teamId: string): Promise<number> {
  const result = await prisma.user.aggregate({
    where: { teamId, deletedAt: null },
    _avg: { commitmentScore: true },
  })

  return Math.round(result._avg.commitmentScore ?? 0)
}

/**
 * Determine trend by comparing the last 14 days vs the prior 14 days.
 */
async function computeTrend(teamId: string): Promise<HealthTrend> {
  const now = new Date()

  const recentFrom = new Date(now.getTime() - TREND_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const priorFrom = new Date(now.getTime() - TREND_WINDOW_DAYS * 2 * 24 * 60 * 60 * 1000)

  const [recent, prior] = await Promise.all([
    computeFulfillmentRate(teamId, recentFrom, now),
    computeFulfillmentRate(teamId, priorFrom, recentFrom),
  ])

  const diff = recent.rate - prior.rate

  if (diff > TREND_THRESHOLD) return 'improving'
  if (diff < -TREND_THRESHOLD) return 'declining'
  return 'stable'
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Calculate team health score. Returns a sensible default (score=0) for new teams with no data.
 * Result is cached for 5 minutes.
 */
async function calculateTeamHealthScore(teamId: string): Promise<TeamHealthScore> {
  // 1. Cache check
  try {
    const cached = await redis.get(healthCacheKey(teamId))
    if (cached) {
      return JSON.parse(cached) as TeamHealthScore
    }
  } catch {
    // Redis unavailable — fall through
  }

  // 2. Compute all metrics in parallel
  const now = new Date()
  const fromDate = new Date(now.getTime() - ANALYSIS_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  let fulfillmentData = { rate: 0, fulfilled: 0, missed: 0, onTimeRate: 0 }
  let avgMemberScore = 0
  let trend: HealthTrend = 'stable'

  try {
    ;[fulfillmentData, avgMemberScore, trend] = await Promise.all([
      computeFulfillmentRate(teamId, fromDate, now),
      computeAvgMemberScore(teamId),
      computeTrend(teamId),
    ])
  } catch (error) {
    logger.error({ error, teamId }, 'Error computing team health metrics')
    // Return default score instead of crashing
    return {
      score: 0,
      trend: 'stable',
      fulfillmentRate: 0,
      avgMemberScore: 0,
      onTimeRate: 0,
      computedAt: new Date(),
      basedOnDays: ANALYSIS_WINDOW_DAYS,
    }
  }

  // 3. Weighted formula
  const score = Math.round(
    fulfillmentData.rate * 0.6 +
    avgMemberScore * 0.3 +
    fulfillmentData.onTimeRate * 0.1
  )

  const result: TeamHealthScore = {
    score: Math.min(100, Math.max(0, score)), // clamp to [0, 100]
    trend,
    fulfillmentRate: fulfillmentData.rate,
    avgMemberScore,
    onTimeRate: fulfillmentData.onTimeRate,
    computedAt: new Date(),
    basedOnDays: ANALYSIS_WINDOW_DAYS,
  }

  // 4. Cache result
  try {
    await redis.setex(healthCacheKey(teamId), HEALTH_CACHE_TTL, JSON.stringify(result))
  } catch {
    // Non-fatal
  }

  return result
}

/**
 * Invalidate the health score cache for a team.
 * Called after any commitment status change.
 */
async function invalidateHealthCache(teamId: string): Promise<void> {
  try {
    await redis.del(healthCacheKey(teamId))
  } catch {
    // Non-fatal
  }
}

// ── Export ────────────────────────────────────────────────────────────────────

export const teamHealthService = {
  calculateTeamHealthScore,
  invalidateHealthCache,
}
