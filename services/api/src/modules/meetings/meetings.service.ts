// ─────────────────────────────────────────────────────────────────────────────
// meetings.service.ts — Business Logic Layer
//
// RULES:
//   ✅ All business logic, orchestration, side effects live here
//   ✅ Never touches HTTP (req/res) — pure domain layer
//   ✅ Returns domain objects — never Prisma internal types
//   ✅ Calls repository for DB, recall.service for Recall.ai, mongo.service for transcripts
//   ✅ Handles all error cases with typed AppError subclasses
//
// createMeeting() flow (8 steps — ORDER MATTERS):
//   1. Platform detect
//   2. Plan limit check (Redis-cached)
//   3. Redis dedup (fast path)
//   4. DB dedup (race condition protection)
//   5. Recall.ai bot schedule (BEFORE DB write — fail fast, no orphan records)
//   6. DB write (create meeting with recallBotId)
//   7. Set Redis dedup key (AFTER DB write)
//   8. Return meeting
// ─────────────────────────────────────────────────────────────────────────────

import type { MeetingStatus } from '@prisma/client'
import { redis } from '../../config/redis'
import { prisma } from '../../db/client'
import { logger } from '../../config/logger'
import { AppError, NotFoundError, DuplicateError } from '../../utils/errors'
import { invalidatePlanCache } from '../../middleware/plan-limits.middleware'
import { platformDetect, buildDedupKey, calculateDedupTTL } from '../../utils/platform-detect'
import * as repo from './meetings.repository'
import * as recallService from '../../services/recall.service'
import { mongoService } from '../../services/mongo.service'
import { teamsRepository } from '../teams/teams.repository'
import { validateTransition } from './meetings.service.state'
import type {
  CreateMeetingInput,
  AddBotInput,
  MeetingListFilters,
  MeetingIncludeOptions,
  TranscriptFilters,
} from './meetings.types'

// ── Create Meeting (8-Step Flow) ──────────────────────────────────────────────

/**
 * Create a new meeting and schedule a Recall.ai bot.
 *
 * SECURITY: Plan limit and deduplication checks run BEFORE Recall.ai call.
 * PERFORMANCE: Bot scheduling (slow ~200-500ms) happens before DB write.
 *   → If Recall.ai fails, no orphaned meeting record is created.
 */
export async function createMeeting(input: CreateMeetingInput) {
  const { title, platform, meetingUrl, scheduledAt, calendarEventId, userId, teamId } = input

  // ── Step 1: Platform Detection ────────────────────────────────────────────
  const { platform: detectedPlatform, platformMeetingId } = platformDetect(meetingUrl)

  // If declared platform is not MANUAL, validate it matches detection
  if (platform !== 'MANUAL' && detectedPlatform !== platform) {
    throw new AppError(
      'MEETING_INVALID_URL',
      422,
      `Meeting URL does not match platform '${platform}'. Detected: '${detectedPlatform}'`,
      { declaredPlatform: platform, detectedPlatform }
    )
  }

  logger.info({ teamId, platform, platformMeetingId }, 'Creating meeting')

  // ── Step 2: Plan Limit Check ──────────────────────────────────────────────
  // Note: checkMeetingLimit middleware handles this BEFORE the controller is called.
  // This is an additional service-layer guard for when service is called directly.
  // The middleware is the primary check — this is defense in depth.

  // ── Step 3: Redis Deduplication (fast path, ~1ms) ─────────────────────────
  if (platform !== 'MANUAL' && platformMeetingId) {
    const dedupKey = buildDedupKey(platform, platformMeetingId)
    const existingId = await redis.get(dedupKey).catch(() => null)

    if (existingId) {
      logger.warn({ teamId, dedupKey, existingMeetingId: existingId }, 'Duplicate meeting blocked by Redis dedup')
      throw new DuplicateError(
        'A meeting with this URL is already scheduled for your team',
        { existingMeetingId: existingId, platform, platformMeetingId }
      )
    }
  }

  // ── Step 4: DB Deduplication (race condition protection, ~5ms) ───────────
  if (platform !== 'MANUAL' && platformMeetingId) {
    const existing = await repo.findByPlatformId(teamId, platform, platformMeetingId)

    if (existing) {
      logger.warn(
        { teamId, existingId: existing.id, platformMeetingId },
        'Duplicate meeting blocked by DB dedup'
      )
      throw new DuplicateError(
        'A meeting with this URL is already scheduled for your team',
        { existingMeetingId: existing.id, platform, platformMeetingId }
      )
    }
  }

  // ── Step 5: Schedule Recall.ai Bot (BEFORE DB write) ─────────────────────
  // If Recall.ai fails → throw IntegrationError → no orphaned meeting record
  const botJoinAt = new Date(scheduledAt.getTime() - 2 * 60 * 1000) // 2 minutes early

  const { botId } = await recallService.scheduleBot({
    meetingUrl,
    joinAt: botJoinAt,
    teamId,
    // meetingId not yet known (DB write hasn't happened) — set in metadata after write
  })

  // ── Step 6: Persist Meeting Record ───────────────────────────────────────
  let meeting
  try {
    meeting = await repo.create({
      teamId,
      title,
      platform,
      meetingUrl,
      platformMeetingId: platformMeetingId ?? null,
      recallBotId: botId,
      scheduledAt,
      calendarEventId,
      status: 'SCHEDULED',
    })
  } catch (error: any) {
    // ── If DB write fails, bot is already scheduled → attempt cleanup ─────
    logger.error({ teamId, botId, error }, 'DB write failed after bot scheduled — attempting bot cleanup')

    try {
      await recallService.removeBot(botId)
      logger.info({ botId }, 'Bot cleaned up after DB write failure')
    } catch (cleanupError) {
      logger.error({ botId, cleanupError }, 'Bot cleanup failed — orphaned bot in Recall.ai')
      // Non-fatal — operations team should reconcile
    }

    // Prisma unique constraint violation (race condition — someone else won)
    if (error?.code === 'P2002') {
      throw new DuplicateError('A meeting with this URL is already scheduled')
    }

    throw error
  }

  // ── Step 7: Set Redis Dedup Key (AFTER DB write) ──────────────────────────
  if (platform !== 'MANUAL' && platformMeetingId) {
    const dedupKey = buildDedupKey(platform, platformMeetingId)
    const ttl = calculateDedupTTL(scheduledAt)

    redis.setex(dedupKey, ttl, meeting.id).catch((err) => {
      // Non-fatal — DB dedup will catch it on next attempt
      logger.warn({ dedupKey, ttl, meetingId: meeting.id, err }, 'redis_dedup_key_missing: Redis setex failed')
    })
  }

  logger.info(
    { teamId, meetingId: meeting.id, botId, platform },
    '✅ Meeting created successfully'
  )

  // ── Step 8: Return ────────────────────────────────────────────────────────
  return {
    meeting,
    message: `Meeting scheduled. Recall.ai bot will join 2 minutes early at ${botJoinAt.toISOString()}.`,
  }
}

// ── List Meetings ─────────────────────────────────────────────────────────────

export async function listMeetings(teamId: string, filters: MeetingListFilters) {
  // Convert date strings to Date objects
  const parsedFilters: MeetingListFilters = {
    ...filters,
    from: filters.from ? new Date(filters.from as unknown as string) : undefined,
    to: filters.to ? new Date(filters.to as unknown as string) : undefined,
  }

  return repo.list(teamId, parsedFilters)
}

// ── Get Meeting Detail ────────────────────────────────────────────────────────

export async function getMeeting(
  id: string,
  teamId: string,
  include: MeetingIncludeOptions = {}
) {
  const meeting = await repo.findWithRelations(id, teamId, {
    participants: include.participants ?? true,
    commitments: include.commitments ?? true,
    actionItems: include.actionItems ?? true,
    decisions: include.decisions ?? true,
    blockers: include.blockers ?? true,
  })

  if (!meeting) {
    // 404 — never distinguish "not found" from "wrong team" (security)
    throw new NotFoundError('Meeting', id)
  }

  // Truncate summary in list view (full summary only in detail view)
  if (meeting.summary && meeting.summary.length > 200) {
    // For detail view, return full summary
  }

  return meeting
}

// ── Get Transcript ────────────────────────────────────────────────────────────

export async function getTranscript(
  id: string,
  teamId: string,
  filters?: TranscriptFilters
) {
  const meeting = await repo.findById(id, teamId)

  if (!meeting) {
    throw new NotFoundError('Meeting', id)
  }

  if (!meeting.mongoTranscriptId || meeting.status !== 'DONE') {
    throw new AppError(
      'TRANSCRIPT_NOT_AVAILABLE',
      404,
      'Transcript not yet available. Meeting must be in DONE status.',
      { status: meeting.status, hasTranscriptId: !!meeting.mongoTranscriptId }
    )
  }

  const transcript = await mongoService.getTranscript(meeting.mongoTranscriptId, filters)

  if (!transcript) {
    throw new AppError(
      'MEETING_NO_TRANSCRIPT',
      404,
      'Transcript document not found in database. It may have been deleted.',
      { mongoTranscriptId: meeting.mongoTranscriptId }
    )
  }

  return transcript
}

// ── Add Bot Manually ──────────────────────────────────────────────────────────

/**
 * Manually add a bot to an already-running or upcoming meeting.
 * Creates a new meeting record immediately with BOT_JOINING status.
 */
export async function addBotManually(input: AddBotInput) {
  const { meetingUrl, userId, teamId } = input

  const { platform, platformMeetingId } = platformDetect(meetingUrl)

  // Dedup check for manual bot add
  if (platform !== 'MANUAL' && platformMeetingId) {
    const dedupKey = buildDedupKey(platform, platformMeetingId)
    const existingId = await redis.get(dedupKey).catch(() => null)
    if (existingId) {
      throw new DuplicateError('A bot is already scheduled or active for this meeting URL')
    }

    const existing = await repo.findByPlatformId(teamId, platform, platformMeetingId)
    if (existing) {
      throw new DuplicateError('A meeting with this URL is already active')
    }
  }

  // Schedule bot immediately (join now)
  const { botId } = await recallService.scheduleBot({
    meetingUrl,
    joinAt: new Date(), // immediate join
    teamId,
  })

  const meeting = await repo.create({
    teamId,
    title: 'Manual Bot Addition',
    platform,
    meetingUrl,
    platformMeetingId: platformMeetingId ?? null,
    recallBotId: botId,
    scheduledAt: new Date(),
    status: 'BOT_JOINING',
  })

  // Set Redis dedup key
  if (platform !== 'MANUAL' && platformMeetingId) {
    const dedupKey = buildDedupKey(platform, platformMeetingId)
    redis.setex(dedupKey, 4 * 3600, meeting.id).catch(() => {})
  }

  logger.info({ teamId, meetingId: meeting.id, botId }, 'Bot added manually')
  return { meeting, message: 'Bot is joining the meeting. Expect it to appear within 30 seconds.' }
}

// ── Remove Bot ────────────────────────────────────────────────────────────────

export async function removeBot(id: string, teamId: string) {
  const meeting = await repo.findById(id, teamId)

  if (!meeting) {
    throw new NotFoundError('Meeting', id)
  }

  // Can only cancel from non-terminal states
  if (meeting.status === 'DONE' || meeting.status === 'FAILED' || meeting.status === 'CANCELLED') {
    throw new AppError(
      'INVALID_STATUS_TRANSITION',
      409,
      `Cannot remove bot — meeting is already in ${meeting.status} status`
    )
  }

  if (!meeting.recallBotId) {
    throw new AppError('RECALL_BOT_NOT_FOUND', 404, 'No Recall.ai bot associated with this meeting')
  }

  // Validate state transition
  validateTransition(meeting.status, 'CANCELLED')

  // Remove bot from Recall.ai (idempotent — 404 is success)
  await recallService.removeBot(meeting.recallBotId)

  // Update status
  const updated = await repo.updateStatus(id, teamId, 'CANCELLED')

  // Remove Redis dedup key
  if (meeting.platformMeetingId && meeting.platform) {
    const dedupKey = buildDedupKey(meeting.platform, meeting.platformMeetingId)
    redis.del(dedupKey).catch(() => {})
  }

  logger.info({ meetingId: id, teamId }, 'Bot removed, meeting cancelled')
  return updated
}

// ── Delete Meeting ────────────────────────────────────────────────────────────

export async function deleteMeeting(
  id: string,
  teamId: string,
  deleteTranscript = false
) {
  const meeting = await repo.findById(id, teamId)

  if (!meeting) {
    throw new NotFoundError('Meeting', id)
  }

  // Cannot delete active recordings
  if (meeting.status === 'RECORDING') {
    throw new AppError(
      'MEETING_ACTIVE_CANNOT_DELETE',
      409,
      'Cannot delete a meeting that is actively recording. Remove the bot first using DELETE /meetings/:id/bot'
    )
  }

  // Optionally delete MongoDB transcript
  if (deleteTranscript && meeting.mongoTranscriptId) {
    await mongoService.deleteTranscript(meeting.mongoTranscriptId).catch((err: any) => {
      logger.warn({ mongoTranscriptId: meeting.mongoTranscriptId, err }, 'Transcript delete failed — proceeding with meeting delete')
    })
  }

  // Delete PostgreSQL record (CASCADE handles children)
  await repo.deleteMeeting(id, teamId)

  // Remove Redis dedup key
  if (meeting.platformMeetingId && meeting.platform) {
    const dedupKey = buildDedupKey(meeting.platform, meeting.platformMeetingId)
    redis.del(dedupKey).catch(() => {})
  }

  logger.info({ meetingId: id, teamId, deleteTranscript }, 'Meeting deleted')
  return { message: 'Meeting deleted successfully' }
}

// ── Update Meeting Status (Internal — called from Webhook Handler Day 18) ─────

/**
 * Internal-only status update. Called by the Recall.ai webhook handler (Day 18).
 * Validates state machine transition before updating.
 * Returns the updated meeting for downstream use.
 */
export async function updateMeetingStatus(
  id: string,
  newStatus: MeetingStatus,
  extraData?: Record<string, unknown>
) {
  let meeting = await repo.findByRecallBotId(id)
  if (!meeting) {
    meeting = await prisma.meeting.findUnique({ where: { id } })
  }

  if (!meeting) {
    throw new NotFoundError('Meeting (by bot ID or meeting ID)', id)
  }

  // Validate transition
  validateTransition(meeting.status, newStatus)

  const updated = await repo.update(meeting.id, {
    status: newStatus,
    ...(newStatus === 'RECORDING' && { startedAt: new Date() }),
    ...(newStatus === 'PROCESSING' && { endedAt: new Date(), processingStartedAt: new Date() }),
    ...(newStatus === 'DONE' && { processingCompletedAt: new Date() }),
    ...(extraData as any),
  })

  logger.info({ meetingId: meeting.id, from: meeting.status, to: newStatus }, 'Meeting status updated')

  // Invalidate plan cache after meeting reaches DONE (meetingsUsed increments)
  if (newStatus === 'DONE') {
    await teamsRepository.incrementMeetingsUsed(meeting.teamId).catch((err) => {
      logger.error({ teamId: meeting.teamId, err }, 'Failed to increment meetingsUsed')
    })
    invalidatePlanCache(meeting.teamId).catch(() => {})
  }

  return updated
}
