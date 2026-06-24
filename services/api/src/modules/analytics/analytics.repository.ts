// ─────────────────────────────────────────────────────────────────────────────
// analytics.repository.ts — Raw aggregation SQL via Prisma $queryRaw
//
// Design principles:
//  - ONE $queryRaw call per function (no N+1, no sequential round trips)
//  - FILTER (WHERE ...) clauses for multi-bucket aggregation in one shot
//  - Raw row shapes returned — formatting/rounding happens in the SERVICE layer
//  - LEFT JOIN in getMemberBreakdown ensures members with zero commitments
//    still appear (an INNER JOIN would be a correctness bug in a team health view)
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from '../../db/client'
import type {
  RawOverviewRow,
  RawMemberRow,
  RawTrendRow,
  AnalyticsMetric,
  AnalyticsGranularity,
} from './analytics.types'

export const analyticsRepository = {
  /**
   * Single-query overview aggregation via FILTER-based SQL.
   * Computes all commitment buckets + meeting stats in ONE round trip.
   */
  async getOverviewAggregates(
    teamId: string,
    from: Date,
    to: Date
  ): Promise<RawOverviewRow> {
    const rows = await prisma.$queryRaw<RawOverviewRow[]>`
      WITH commitment_stats AS (
        SELECT
          COUNT(*)                                                         AS total,
          COUNT(*) FILTER (WHERE status = 'FULFILLED')                    AS fulfilled,
          COUNT(*) FILTER (WHERE status = 'MISSED')                       AS missed,
          COUNT(*) FILTER (WHERE status = 'PENDING')                      AS pending,
          COUNT(*) FILTER (WHERE status = 'DEFERRED')                     AS deferred,
          NULLIF(
            ROUND(
              100.0 * COUNT(*) FILTER (WHERE status = 'FULFILLED') /
              NULLIF(
                COUNT(*) FILTER (WHERE status IN ('FULFILLED', 'MISSED')),
                0
              ),
              2
            ),
            NULL
          )                                                                AS fulfillment_rate,
          ROUND(
            AVG(
              EXTRACT(EPOCH FROM (resolved_at - due_date)) / 86400.0
            ) FILTER (WHERE status = 'MISSED' AND resolved_at IS NOT NULL AND due_date IS NOT NULL),
            2
          )                                                                AS avg_days_overdue
        FROM commitments
        WHERE team_id = ${teamId}::uuid
          AND created_at >= ${from}
          AND created_at <= ${to}
          AND deleted_at IS NULL
      ),
      meeting_stats AS (
        SELECT
          COUNT(*)                                                          AS meetings_this_period,
          ROUND(
            AVG(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60.0)
            FILTER (WHERE started_at IS NOT NULL AND ended_at IS NOT NULL),
            2
          )                                                                 AS avg_meeting_duration
        FROM meetings
        WHERE team_id = ${teamId}::uuid
          AND created_at >= ${from}
          AND created_at <= ${to}
          AND deleted_at IS NULL
      )
      SELECT
        c.total,
        c.fulfilled,
        c.missed,
        c.pending,
        c.deferred,
        c.fulfillment_rate,
        c.avg_days_overdue,
        m.meetings_this_period,
        m.avg_meeting_duration
      FROM commitment_stats c, meeting_stats m
    `

    return rows[0]
  },

  /**
   * Member breakdown via LEFT JOIN — includes members with ZERO commitments in the period.
   * Ordered by commitment_score DESC.
   */
  async getMemberBreakdown(
    teamId: string,
    from: Date,
    to: Date
  ): Promise<RawMemberRow[]> {
    const rows = await prisma.$queryRaw<RawMemberRow[]>`
      SELECT
        u.id                                                                AS user_id,
        u.name,
        u.avatar_url,
        u.role,
        COALESCE(u.commitment_score, 0)                                     AS commitment_score,
        COUNT(c.id)                                                         AS total,
        COUNT(c.id) FILTER (WHERE c.status = 'FULFILLED')                  AS fulfilled,
        COUNT(c.id) FILTER (WHERE c.status = 'MISSED')                     AS missed,
        COUNT(c.id) FILTER (WHERE c.status = 'PENDING')                    AS pending,
        ROUND(
          100.0 * COUNT(c.id) FILTER (WHERE c.status = 'FULFILLED') /
          NULLIF(
            COUNT(c.id) FILTER (WHERE c.status IN ('FULFILLED', 'MISSED')),
            0
          ),
          2
        )                                                                   AS fulfillment_rate
      FROM users u
      LEFT JOIN commitments c
        ON c.owner_id = u.id
        AND c.created_at >= ${from}
        AND c.created_at <= ${to}
        AND c.deleted_at IS NULL
      WHERE u.team_id = ${teamId}::uuid
        AND u.deleted_at IS NULL
      GROUP BY u.id, u.name, u.avatar_url, u.role, u.commitment_score
      ORDER BY commitment_score DESC
    `

    return rows
  },

  /**
   * Trend points grouped by week or month bucket.
   * Forward-compatible: return shape is identical to what a future pre-computed
   * table would return — swapping internals requires NO contract change.
   */
  async getTrendPoints(
    teamId: string,
    metric: AnalyticsMetric,
    granularity: AnalyticsGranularity,
    from: Date,
    to: Date
  ): Promise<RawTrendRow[]> {
    const truncUnit = granularity === 'week' ? 'week' : 'month'

    if (metric === 'fulfillmentRate') {
      return prisma.$queryRaw<RawTrendRow[]>`
        SELECT
          DATE_TRUNC(${truncUnit}, created_at)                               AS bucket,
          ROUND(
            100.0 * COUNT(*) FILTER (WHERE status = 'FULFILLED') /
            NULLIF(
              COUNT(*) FILTER (WHERE status IN ('FULFILLED', 'MISSED')),
              0
            ),
            2
          )                                                                  AS value,
          COUNT(*)                                                           AS count
        FROM commitments
        WHERE team_id = ${teamId}::uuid
          AND created_at >= ${from}
          AND created_at <= ${to}
          AND deleted_at IS NULL
        GROUP BY DATE_TRUNC(${truncUnit}, created_at)
        ORDER BY bucket ASC
      `
    }

    // metric === 'meetingsCount'
    return prisma.$queryRaw<RawTrendRow[]>`
      SELECT
        DATE_TRUNC(${truncUnit}, created_at)   AS bucket,
        COUNT(*)::numeric                      AS value,
        COUNT(*)                               AS count
      FROM meetings
      WHERE team_id = ${teamId}::uuid
        AND created_at >= ${from}
        AND created_at <= ${to}
        AND deleted_at IS NULL
      GROUP BY DATE_TRUNC(${truncUnit}, created_at)
      ORDER BY bucket ASC
    `
  },
}
