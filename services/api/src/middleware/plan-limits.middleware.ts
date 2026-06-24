// ─────────────────────────────────────────────────────────────────────────────
// plan-limits.middleware.ts — Redis-Cached Quota Enforcement
//
// Applied BEFORE quota-limited route handlers.
// Uses Redis cache (1h TTL) to avoid DB hit on every request.
//
// Usage:
//   router.post('/meetings', requireAuth, injectTenant, checkMeetingLimit, handler)
//
// Cache Strategy (Cache-Aside):
//   Read  → check Redis → miss → query DB → write Redis → proceed
//   Write → update DB  → delete Redis key (NOT update — prevents race conditions)
// ─────────────────────────────────────────────────────────────────────────────

import type { Request, Response, NextFunction } from 'express'
import { prisma } from '../db/client'
import { redis } from '../config/redis'
import { logger } from '../config/logger'
import { PLAN_LIMITS, getUpgradeUrl } from '../config/plans.config'
import { PlanLimitError } from '../utils/errors'
import { PlanType } from '@prisma/client'

// ── Cache Helpers ─────────────────────────────────────────────────────────────

const PLAN_CACHE_TTL = 3600 // 1 hour in seconds

function planCacheKey(teamId: string): string {
  return `cache:team:plan:${teamId}`
}

interface PlanCacheEntry {
  plan: PlanType
  meetingsUsed: number
  membersCount: number
}

async function getPlanFromCache(teamId: string): Promise<PlanCacheEntry | null> {
  try {
    const cached = await redis.get(planCacheKey(teamId))
    if (!cached) return null
    return JSON.parse(cached) as PlanCacheEntry
  } catch {
    // Redis unavailable — treat as cache miss, fall through to DB
    return null
  }
}

async function writePlanToCache(teamId: string, entry: PlanCacheEntry): Promise<void> {
  try {
    await redis.setex(planCacheKey(teamId), PLAN_CACHE_TTL, JSON.stringify(entry))
  } catch {
    // Non-fatal — cache write failure should not block the request
  }
}

async function fetchPlanFromDB(teamId: string): Promise<PlanCacheEntry> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      plan: true,
      meetingsUsed: true,
      _count: { select: { members: { where: { deletedAt: null } } } },
    },
  })

  if (!team) {
    // Team was deleted but JWT still has teamId — treat as 0 usage
    return { plan: PlanType.FREE, meetingsUsed: 0, membersCount: 0 }
  }

  return {
    plan: team.plan,
    meetingsUsed: team.meetingsUsed,
    membersCount: team._count.members,
  }
}

// ── Middleware: Meeting Limit Check ───────────────────────────────────────────

/**
 * Middleware to enforce the monthly meeting creation limit.
 * Must be used AFTER requireAuth + injectTenant.
 *
 * Flow:
 *   1. Check Redis cache for { plan, meetingsUsed }
 *   2. Cache miss → query DB → write to Redis (1h TTL)
 *   3. If plan is unlimited (-1) → pass immediately
 *   4. If meetingsUsed >= limit → throw PlanLimitError (402)
 *   5. Otherwise → next()
 *
 * Note: Cache is invalidated by the meeting processing worker after a
 * meeting reaches DONE status, keeping quota counts accurate.
 */
export async function checkMeetingLimit(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const teamId = req.teamId

  if (!teamId) {
    return next() // injectTenant should have blocked this — defensive guard
  }

  try {
    // 1. Try cache first
    let entry = await getPlanFromCache(teamId)

    // 2. Cache miss → query DB
    if (!entry) {
      entry = await fetchPlanFromDB(teamId)
      await writePlanToCache(teamId, entry)
    }

    const { plan, meetingsUsed } = entry
    const limit = PLAN_LIMITS[plan].meetings

    // 3. Unlimited plan (-1) → always pass
    if (limit === -1) {
      return next()
    }

    // 4. Limit exceeded → block
    if (meetingsUsed >= limit) {
      logger.warn({ teamId, plan, meetingsUsed, limit }, 'Meeting limit reached')
      return next(new PlanLimitError('Meetings', meetingsUsed, limit, getUpgradeUrl(plan)))
    }

    // 5. Under limit → proceed
    next()
  } catch (error) {
    logger.error({ error, teamId }, 'Error in checkMeetingLimit middleware')
    next(error)
  }
}

// ── Cache Invalidation Helper (called by workers/services) ───────────────────

/**
 * Delete the plan cache for a team.
 * Called after:
 *   - A meeting reaches DONE status (meetingsUsed incremented)
 *   - A plan upgrade/downgrade
 *   - A member joins or leaves
 */
export async function invalidatePlanCache(teamId: string): Promise<void> {
  try {
    await redis.del(planCacheKey(teamId))
    logger.debug({ teamId }, 'Plan cache invalidated')
  } catch {
    // Non-fatal
  }
}
