// ─────────────────────────────────────────────────────────────────────────────
// meetings.repository.ts — Data Layer: All Prisma DB Queries
//
// RULES:
//   ✅ All queries include teamId in WHERE (tenant isolation — layer 2)
//   ✅ Only returns domain types — never raw Prisma types to callers
//   ✅ Zero business logic — pure data access
//   ✅ Cursor pagination — never offset (prevents duplicates on concurrent inserts)
//   ✅ Selective SELECT in list queries — never SELECT * for large datasets
//   ✅ State machine guard in updateStatus() — defense in depth
// ─────────────────────────────────────────────────────────────────────────────

import { Prisma, MeetingStatus } from '@prisma/client'
import { prisma } from '../../db/client'
import { logger } from '../../config/logger'
import { AppError, NotFoundError, DuplicateError } from '../../utils/errors'
import { encodeCursor, decodeCursor } from '../../utils/pagination'
import { validateTransition } from './meetings.service.state'
import type {
  CreateMeetingData,
  UpdateMeetingData,
  MeetingListFilters,
  MeetingWithRelations,
  MeetingIncludeOptions,
  MeetingListItem,
} from './meetings.types'

// ── Select Projections ────────────────────────────────────────────────────────

/**
 * Minimal SELECT for list queries — never fetch large TEXT columns in bulk.
 * Only what's needed for the meeting card UI.
 */
const LIST_SELECT = {
  id: true,
  title: true,
  platform: true,
  status: true,
  scheduledAt: true,
  startedAt: true,
  endedAt: true,
  durationMinutes: true,
  participantCount: true,
  commitmentCount: true,
  actionItemCount: true,
  decisionCount: true,
  blockerCount: true,
  summary: true,   // truncated in service layer to 200 chars
  createdAt: true,
} as const

// ── Create ────────────────────────────────────────────────────────────────────

export async function create(data: CreateMeetingData) {
  return prisma.meeting.create({
    data: {
      teamId: data.teamId,
      title: data.title,
      platform: data.platform,
      meetingUrl: data.meetingUrl,
      platformMeetingId: data.platformMeetingId,
      recallBotId: data.recallBotId,
      scheduledAt: data.scheduledAt,
      calendarEventId: data.calendarEventId,
      status: data.status,
    },
  })
}

// ── Find By ID ────────────────────────────────────────────────────────────────

/**
 * Find meeting by ID, scoped to team.
 * ALWAYS includes teamId — never trust ID alone (tenant isolation).
 */
export async function findById(id: string, teamId: string) {
  return prisma.meeting.findFirst({
    where: { id, teamId },
  })
}

// ── Find By Recall Bot ID ─────────────────────────────────────────────────────

/**
 * Find meeting by Recall.ai bot ID.
 * Used by the webhook handler (Day 18). Must be fast — on hot webhook path.
 */
export async function findByRecallBotId(botId: string) {
  return prisma.meeting.findFirst({
    where: { recallBotId: botId },
  })
}

// ── Find By Platform ID (Deduplication) ──────────────────────────────────────

/**
 * Deduplication query: find active meeting with the same platform+meetingId for this team.
 * Excludes terminal statuses (DONE, FAILED, CANCELLED).
 */
export async function findByPlatformId(
  teamId: string,
  platform: string,
  platformMeetingId: string
) {
  return prisma.meeting.findFirst({
    where: {
      teamId,
      platform: platform as any,
      platformMeetingId,
      status: {
        notIn: ['DONE', 'FAILED', 'CANCELLED'],
      },
    },
    select: { id: true, status: true, scheduledAt: true },
  })
}

// ── List (Cursor Paginated) ───────────────────────────────────────────────────

/**
 * Cursor-paginated list of team meetings.
 * Uses (scheduledAt DESC, id DESC) composite for stable pagination.
 * Fetches limit+1 to determine hasMore.
 */
export async function list(
  teamId: string,
  filters: MeetingListFilters
): Promise<{ meetings: MeetingListItem[]; nextCursor: string | null }> {
  const {
    status,
    platform,
    from,
    to,
    search,
    limit,
    cursor,
    sortBy = 'scheduledAt',
    sortOrder = 'desc',
  } = filters

  // ── Build WHERE clause ────────────────────────────────────────────────────
  const where: Prisma.MeetingWhereInput = { teamId }

  if (status) {
    if (Array.isArray(status)) {
      where.status = { in: status }
    } else {
      where.status = status
    }
  }

  if (platform) where.platform = platform

  if (from || to) {
    where.scheduledAt = {}
    if (from) where.scheduledAt.gte = from
    if (to) where.scheduledAt.lte = to
  }

  if (search) {
    where.title = { contains: search, mode: 'insensitive' }
  }

  // ── Cursor ────────────────────────────────────────────────────────────────
  let cursorCondition: Prisma.MeetingWhereInput | undefined

  if (cursor) {
    try {
      const decoded = decodeCursor(cursor)
      const operator = sortOrder === 'desc' ? 'lt' : 'gt'
      const sortField = sortBy === 'createdAt' ? 'createdAt' : 'scheduledAt'

      cursorCondition = {
        OR: [
          {
            [sortField]: { [operator]: decoded.createdAt },
          },
          {
            [sortField]: decoded.createdAt,
            id: { [operator]: decoded.id },
          },
        ],
      }
    } catch {
      throw new AppError('INVALID_CURSOR', 422, 'Cursor is malformed or expired')
    }
  }

  // ── Query ─────────────────────────────────────────────────────────────────
  const raw = await prisma.meeting.findMany({
    where: cursorCondition ? { AND: [where, cursorCondition] } : where,
    select: LIST_SELECT,
    orderBy: [
      { [sortBy]: sortOrder },
      { id: sortOrder }, // tie-breaker for stable pagination
    ],
    take: limit + 1, // fetch one extra to determine hasMore
  })

  const hasMore = raw.length > limit
  const meetings = hasMore ? raw.slice(0, limit) : raw

  const nextCursor =
    hasMore && meetings.length > 0
      ? encodeCursor(
          meetings[meetings.length - 1].id,
          sortBy === 'createdAt'
            ? meetings[meetings.length - 1].createdAt
            : meetings[meetings.length - 1].scheduledAt
        )
      : null

  return {
    meetings: meetings as unknown as MeetingListItem[],
    nextCursor,
  }
}

// ── Find With Relations ───────────────────────────────────────────────────────

/**
 * Full meeting detail with optional eager-loaded relations.
 * Only loads what the client requested via ?include= param.
 */
export async function findWithRelations(
  id: string,
  teamId: string,
  include: MeetingIncludeOptions
): Promise<MeetingWithRelations | null> {
  return prisma.meeting.findFirst({
    where: { id, teamId },
    include: {
      participants: include.participants ?? true,
      commitments: include.commitments ?? true,
      actionItems: include.actionItems ?? true,
      decisions: include.decisions ?? true,
      blockers: include.blockers ?? true,
    },
  }) as Promise<MeetingWithRelations | null>
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function update(id: string, data: Partial<UpdateMeetingData>) {
  return prisma.meeting.update({
    where: { id },
    data,
  })
}

// ── Update Status (with state machine guard) ──────────────────────────────────

/**
 * Dedicated status update with double-layer state machine validation.
 * Service calls validateTransition() first — this is the second defense.
 * A rogue worker cannot bypass the state machine by calling repo directly.
 */
export async function updateStatus(
  id: string,
  teamId: string,
  newStatus: MeetingStatus,
  extraData?: Partial<UpdateMeetingData>
) {
  const meeting = await findById(id, teamId)
  if (!meeting) {
    throw new NotFoundError('Meeting', id)
  }

  // ── Defense in depth: validate transition again at repo layer ──────────────
  validateTransition(meeting.status, newStatus)

  const timestampFields: Partial<UpdateMeetingData> = {}
  if (newStatus === 'RECORDING') timestampFields.startedAt = new Date()
  if (newStatus === 'PROCESSING') timestampFields.endedAt = new Date()
  if (newStatus === 'PROCESSING') timestampFields.processingStartedAt = new Date()
  if (newStatus === 'DONE') timestampFields.processingCompletedAt = new Date()

  return prisma.meeting.update({
    where: { id },
    data: {
      status: newStatus,
      ...timestampFields,
      ...extraData,
    },
  })
}

// ── Delete ────────────────────────────────────────────────────────────────────

/**
 * Hard delete a meeting. Validates team ownership and active-recording guard.
 * ON DELETE CASCADE in schema handles: commitments, actionItems, decisions, blockers, participants.
 */
export async function deleteMeeting(id: string, teamId: string): Promise<void> {
  const meeting = await findById(id, teamId)

  if (!meeting) {
    throw new NotFoundError('Meeting', id)
  }

  if (meeting.status === 'RECORDING') {
    throw new AppError(
      'MEETING_ACTIVE_CANNOT_DELETE',
      409,
      'Cannot delete a meeting that is currently recording. Remove the bot first.'
    )
  }

  await prisma.meeting.delete({
    where: { id },
  })

  logger.info({ meetingId: id, teamId }, 'Meeting hard-deleted')
}

// ── Count Meetings This Month (Fallback for plan enforcement) ─────────────────

/**
 * Count DONE meetings this billing month for a team.
 * Used as fallback when Redis plan cache is cold.
 * Primary check uses the denormalized teams.meetingsUsed counter.
 */
export async function countMeetingsThisMonth(teamId: string): Promise<number> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  return prisma.meeting.count({
    where: {
      teamId,
      status: 'DONE',
      createdAt: { gte: monthStart },
    },
  })
}
