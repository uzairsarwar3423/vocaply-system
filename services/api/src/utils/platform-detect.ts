// ─────────────────────────────────────────────────────────────────────────────
// platform-detect.ts — Meeting URL → Platform + Meeting ID Extraction
//
// Pure function — zero side effects, zero dependencies.
// Used by: meetings.validator.ts (cross-field validation)
//          meetings.service.ts (deduplication key construction)
//
// Security Note:
//   We only extract the platformMeetingId — never use other URL parts as
//   trusted data. Malicious query params are irrelevant since we only use
//   the extracted ID for deduplication, never in downstream calls.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto'
import type { PlatformDetectResult } from '../modules/meetings/meetings.types'

// ── Platform URL Patterns ─────────────────────────────────────────────────────

const ZOOM_PATTERNS = [
  /zoom\.us\/j\/(\d+)/,
  /zoom\.us\/my\/[\w.-]+/,
  /zoom\.us\/wc\/(\d+)/,
]

const GOOGLE_MEET_PATTERNS = [
  /meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i,
  /g\.co\/meet\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i,
]

const TEAMS_PATTERNS = [
  /teams\.microsoft\.com\/l\/meetup-join\//i,
  /teams\.microsoft\.com\/meet\//i,
  /teams\.live\.com\//i,
]

const WEBEX_PATTERNS = [
  /webex\.com\/meet\/([\w-]+)/,
  /webex\.com\/j\/(\d+)/,
  /cisco\.webex\.com\/meet\/([\w-]+)/,
]

// ── Extractors ────────────────────────────────────────────────────────────────

function extractZoomMeetingId(url: string): string | null {
  const match = url.match(/zoom\.us\/(?:j|wc)\/(\d+)/)
  if (match) {
    return match[1].replace(/^0+/, '') // strip leading zeros
  }
  return null
}

function extractGoogleMeetCode(url: string): string | null {
  for (const pattern of GOOGLE_MEET_PATTERNS) {
    const match = url.match(pattern)
    if (match) return match[1].toLowerCase()
  }
  return null
}

/**
 * Teams URLs contain session tokens that vary between clicks to the same meeting.
 * We SHA-256 the normalized URL (stripped of query params that vary) and take
 * the first 16 hex chars as a stable meeting identifier.
 */
function extractTeamsMeetingId(url: string): string {
  try {
    const parsed = new URL(url)
    // Normalize: remove session-specific query params, keep path only
    const normalized = `${parsed.origin}${parsed.pathname}`
    return createHash('sha256').update(normalized).digest('hex').slice(0, 16)
  } catch {
    // If URL parsing fails, hash the full URL
    return createHash('sha256').update(url).digest('hex').slice(0, 16)
  }
}

function extractWebexMeetingId(url: string): string | null {
  const roomMatch = url.match(/webex\.com\/meet\/([\w-]+)/)
  if (roomMatch) return roomMatch[1]

  const numericMatch = url.match(/webex\.com\/j\/(\d+)/)
  if (numericMatch) return numericMatch[1]

  return null
}

// ── Main Export ───────────────────────────────────────────────────────────────

/**
 * Detect platform from meeting URL and extract a stable, normalized meeting ID.
 *
 * Returns:
 *   { platform: PlatformType, platformMeetingId: string | null }
 *
 * platformMeetingId is null for MANUAL platform and when detection fails.
 *
 * For deduplication:
 *   ZOOM         → numeric meeting ID (stable)
 *   GOOGLE_MEET  → room code e.g. "abc-defg-hij" (stable)
 *   TEAMS        → SHA-256(normalized URL)[0..15] (best-effort stable)
 *   WEBEX        → room name or numeric ID (stable)
 *   MANUAL       → null (no dedup — manual uploads are always allowed)
 */
export function platformDetect(url: string): PlatformDetectResult {
  if (!url) return { platform: 'MANUAL', platformMeetingId: null }

  // ── Zoom ──────────────────────────────────────────────────────────────────
  if (ZOOM_PATTERNS.some((p) => p.test(url))) {
    return {
      platform: 'ZOOM',
      platformMeetingId: extractZoomMeetingId(url),
    }
  }

  // ── Google Meet ───────────────────────────────────────────────────────────
  if (GOOGLE_MEET_PATTERNS.some((p) => p.test(url))) {
    return {
      platform: 'GOOGLE_MEET',
      platformMeetingId: extractGoogleMeetCode(url),
    }
  }

  // ── Microsoft Teams ───────────────────────────────────────────────────────
  if (TEAMS_PATTERNS.some((p) => p.test(url))) {
    return {
      platform: 'TEAMS',
      platformMeetingId: extractTeamsMeetingId(url),
    }
  }

  // ── Webex ─────────────────────────────────────────────────────────────────
  if (WEBEX_PATTERNS.some((p) => p.test(url))) {
    return {
      platform: 'WEBEX',
      platformMeetingId: extractWebexMeetingId(url),
    }
  }

  // ── Unknown platform ──────────────────────────────────────────────────────
  return { platform: 'MANUAL', platformMeetingId: null }
}

/**
 * Check if a URL matches the declared platform.
 * Used by the Zod superRefine validator for cross-field validation.
 */
export function urlMatchesPlatform(url: string, declaredPlatform: string): boolean {
  if (declaredPlatform === 'MANUAL') return true
  const detected = platformDetect(url)
  return detected.platform === declaredPlatform
}

/**
 * Build the Redis deduplication key for a meeting.
 * Key is per-team: platform + platformMeetingId.
 * Note: NOT globally unique — same Zoom URL on different teams creates separate keys.
 */
export function buildDedupKey(platform: string, platformMeetingId: string): string {
  return `bot:scheduled:${platform.toLowerCase()}:${platformMeetingId}`
}

/**
 * Calculate the TTL for the Redis dedup key.
 * Key must survive until the meeting ends + 4 hours buffer.
 * Minimum TTL is 1 hour to handle bot scheduling windows.
 */
export function calculateDedupTTL(scheduledAt: Date): number {
  const now = Date.now()
  const meetingTime = scheduledAt.getTime()
  const secondsUntilMeeting = Math.max(0, Math.floor((meetingTime - now) / 1000))
  return Math.max(3600, secondsUntilMeeting + 4 * 3600) // min 1hr, max until meeting + 4hrs
}
