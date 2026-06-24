// ─────────────────────────────────────────────────────────────────────────────
// analytics.types.ts
// ─────────────────────────────────────────────────────────────────────────────

export type AnalyticsMetric = 'fulfillmentRate' | 'meetingsCount'
export type AnalyticsGranularity = 'week' | 'month'

/**
 * Response shape for GET /analytics/overview.
 * Identical shape regardless of requester role (all team-level data, no personal data).
 */
export interface AnalyticsOverview {
  fulfillmentRate: number
  totalCommitments: number
  fulfilled: number
  missed: number
  pending: number
  avgDaysOverdue: number
  meetingsThisPeriod: number
  avgMeetingDuration: number
  teamHealthScore: number
}

/**
 * One row in GET /analytics/members response.
 * MEMBER role receives a single-element array with only their own row.
 * MANAGER/ADMIN/OWNER receive the full team array.
 */
export interface MemberAnalyticsRow {
  userId: string
  name: string
  avatarUrl: string | null
  role: string
  score: number
  total: number
  fulfilled: number
  missed: number
  pending: number
  fulfillmentRate: number
}

/**
 * One data point in GET /analytics/trends response.
 */
export interface TrendPoint {
  period: string   // ISO string — bucket start
  value: number    // fulfillmentRate (0–100) or count
  label: string    // human-readable period label (e.g., "Jun 9–15")
  count: number    // number of data items in this bucket
}

/**
 * Summary statistics computed across all trend points.
 */
export interface TrendsSummary {
  average: number
  highest: number
  lowest: number
  trend: 'improving' | 'stable' | 'declining'
}

/**
 * Full response for GET /analytics/trends.
 * Contract-stable: swapping internals from live-query to pre-computed table
 * in the future requires NO change to this shape (or any caller).
 */
export interface TrendsResponse {
  points: TrendPoint[]
  summary: TrendsSummary
}

// ── Raw DB row types (from $queryRaw) ─────────────────────────────────────────

export interface RawOverviewRow {
  total: bigint
  fulfilled: bigint
  missed: bigint
  pending: bigint
  deferred: bigint
  fulfillment_rate: string | null
  avg_days_overdue: string | null
  meetings_this_period: bigint
  avg_meeting_duration: string | null
}

export interface RawMemberRow {
  user_id: string
  name: string
  avatar_url: string | null
  role: string
  commitment_score: number
  total: bigint
  fulfilled: bigint
  missed: bigint
  pending: bigint
  fulfillment_rate: string | null
}

export interface RawTrendRow {
  bucket: Date
  value: string | null
  count: bigint
}

export interface ActivityItem {
  id: string
  type: 'COMMITMENT_FULFILLED' | 'COMMITMENT_CREATED' | 'MEETING_RECORDED' | 'BOT_JOINED' | 'INVITE_SENT'
  actorName: string
  actionText: string
  occurredAt: string
}
