// ─────────────────────────────────────────────────────────────────────────────
// period-hash.ts — Shared Analytics Cache Key Utility
//
// Builds a deterministic short hash from (teamId, from, to) used as the
// suffix for ALL THREE analytics endpoints' cache keys.
//
// WHY THIS EXISTS AS ITS OWN FILE:
//   Without it, each endpoint would invent slightly-different cache-key
//   formats (raw ISO strings vs date-only, different separators, etc).
//   Written once, all three endpoints' cache keys have identical shape,
//   and any future "invalidate all analytics for team X" operation can
//   pattern-match cache:analytics:*:${teamId}:* with confidence.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from 'crypto'

/**
 * Builds a short deterministic hash used as the period-specific segment
 * of analytics cache keys.
 * Format: first 12 hex chars of SHA-256("teamId:fromISO:toISO")
 */
export function buildPeriodHash(teamId: string, from: Date, to: Date): string {
  const input = `${teamId}:${from.toISOString()}:${to.toISOString()}`
  return createHash('sha256').update(input).digest('hex').substring(0, 12)
}
