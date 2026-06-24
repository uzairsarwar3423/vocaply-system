// ─────────────────────────────────────────────────────────────────────────────
// meetings.controller.ts — HTTP Layer (Thin Translation Layer Only)
//
// RULES:
//   ✅ Parse HTTP request → call ONE service function → format HTTP response
//   ✅ Zero business logic
//   ✅ Zero DB access (no Prisma imports)
//   ✅ Every function wrapped in asyncHandler()
//   ✅ All Express 5 req.query / req.params types explicitly cast to string
// ─────────────────────────────────────────────────────────────────────────────

import type { Request, Response } from 'express'
import { asyncHandler } from '../../utils/async-handler'
import { success } from '../../utils/response'
import * as meetingService from './meetings.service'
import type { MeetingListFilters, MeetingIncludeOptions } from './meetings.types'

// ── Query String Helpers ──────────────────────────────────────────────────────
// Express 5 types req.query values as string | string[] | ParsedQs | undefined.
// These helpers safely coerce to primitives.

function qs(val: unknown): string | undefined {
  if (typeof val === 'string') return val
  if (Array.isArray(val) && typeof val[0] === 'string') return val[0] as string
  return undefined
}

function qsNum(val: unknown): number | undefined {
  const s = qs(val)
  if (s === undefined) return undefined
  const n = Number(s)
  return isNaN(n) ? undefined : n
}

function qsBool(val: unknown): boolean {
  return qs(val) === 'true'
}

function param(req: Request, name: string): string {
  const v = req.params[name]
  return typeof v === 'string' ? v : String(v)
}

// ── POST /meetings — Create Meeting ──────────────────────────────────────────

export const createMeetingController = asyncHandler(async (req: Request, res: Response) => {
  const { title, platform, meetingUrl, scheduledAt, calendarEventId } = req.body

  const result = await meetingService.createMeeting({
    title: title as string,
    platform,
    meetingUrl: meetingUrl as string,
    scheduledAt: new Date(scheduledAt as string),
    calendarEventId: calendarEventId as string | undefined,
    userId: req.user!.id,
    teamId: req.teamId as string,
  })

  res.status(201).json(
    success({
      meeting: result.meeting,
      message: result.message,
    })
  )
})

// ── GET /meetings — List Meetings ─────────────────────────────────────────────

export const listMeetingsController = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query

  const fromStr = qs(q.from)
  const toStr = qs(q.to)

  let status: any = undefined;
  if (q.status) {
    if (Array.isArray(q.status)) {
      status = q.status;
    } else if (typeof q.status === "string") {
      status = q.status.includes(",") ? q.status.split(",") : q.status;
    }
  }

  const filters: MeetingListFilters = {
    status,
    platform: qs(q.platform) as any,
    from: fromStr ? new Date(fromStr) : undefined,
    to: toStr ? new Date(toStr) : undefined,
    search: qs(q.search),
    limit: parseInt(qs(q.limit) ?? '20', 10),
    cursor: qs(q.cursor),
    sortBy: (qs(q.sortBy) ?? 'scheduledAt') as MeetingListFilters['sortBy'],
    sortOrder: (qs(q.sortOrder) ?? 'desc') as MeetingListFilters['sortOrder'],
  }

  const { meetings, nextCursor } = await meetingService.listMeetings(req.teamId as string, filters)

  res.status(200).json(
    success(meetings, {
      hasMore: !!nextCursor,
      nextCursor,
      count: meetings.length,
    })
  )
})

// ── GET /meetings/:meetingId — Get Meeting Detail ─────────────────────────────

export const getMeetingController = asyncHandler(async (req: Request, res: Response) => {
  const meetingId = param(req, 'meetingId')

  // Zod transform returns string[]; also handle comma-separated string input
  const rawInclude = req.query.include
  let includeParam: string[]
  if (Array.isArray(rawInclude)) {
    includeParam = (rawInclude as string[]).filter((s) => typeof s === 'string')
  } else if (typeof rawInclude === 'string') {
    includeParam = rawInclude.split(',').map((s) => s.trim())
  } else {
    includeParam = ['participants', 'commitments', 'actionItems', 'decisions', 'blockers']
  }

  const includeOptions: MeetingIncludeOptions = {
    participants: includeParam.includes('participants'),
    commitments: includeParam.includes('commitments'),
    actionItems: includeParam.includes('actionItems'),
    decisions: includeParam.includes('decisions'),
    blockers: includeParam.includes('blockers'),
  }

  const anySelected = Object.values(includeOptions).some(Boolean)
  const include = anySelected
    ? includeOptions
    : { participants: true, commitments: true, actionItems: true, decisions: true, blockers: true }

  const meeting = await meetingService.getMeeting(meetingId, req.teamId as string, include)

  res.status(200).json(success(meeting))
})

// ── GET /meetings/:meetingId/transcript — Get Transcript ─────────────────────

export const getTranscriptController = asyncHandler(async (req: Request, res: Response) => {
  const meetingId = param(req, 'meetingId')
  const q = req.query

  const filters = {
    search: qs(q.search),
    speakerEmail: qs(q.speaker),
    fromTime: qsNum(q.fromTime),
    toTime: qsNum(q.toTime),
  }

  const transcript = await meetingService.getTranscript(meetingId, req.teamId as string, filters)

  res.status(200).json(success(transcript))
})

// ── POST /meetings/bot/add — Manually Add Bot ─────────────────────────────────

export const addBotController = asyncHandler(async (req: Request, res: Response) => {
  const { meetingUrl } = req.body

  const result = await meetingService.addBotManually({
    meetingUrl: meetingUrl as string,
    userId: req.user!.id,
    teamId: req.teamId as string,
  })

  res.status(200).json(
    success({
      meeting: result.meeting,
      message: result.message,
    })
  )
})

// ── DELETE /meetings/:meetingId/bot — Remove Bot ──────────────────────────────

export const removeBotController = asyncHandler(async (req: Request, res: Response) => {
  const meetingId = param(req, 'meetingId')

  const meeting = await meetingService.removeBot(meetingId, req.teamId as string)

  res.status(200).json(
    success({
      meeting,
      message: 'Bot removed. Meeting status set to CANCELLED.',
    })
  )
})

// ── DELETE /meetings/:meetingId — Delete Meeting ──────────────────────────────

export const deleteMeetingController = asyncHandler(async (req: Request, res: Response) => {
  const meetingId = param(req, 'meetingId')
  // Zod coerces to boolean via transform; fallback to raw string check
  const deleteTranscript = typeof req.query.deleteTranscript === 'boolean'
    ? req.query.deleteTranscript as boolean
    : qsBool(req.query.deleteTranscript)

  const result = await meetingService.deleteMeeting(meetingId, req.teamId as string, deleteTranscript)

  res.status(200).json(success(result))
})
