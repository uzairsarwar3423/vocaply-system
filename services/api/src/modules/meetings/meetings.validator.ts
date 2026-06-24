// ─────────────────────────────────────────────────────────────────────────────
// meetings.validator.ts — Zod v4 Schemas for All Meeting Endpoints
//
// NOTE: Zod v4 uses { error: '...' } instead of { required_error: '...' }
// Cross-field validation: URL must match declared platform (superRefine).
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod'
import { urlMatchesPlatform } from '../../utils/platform-detect'

// ── Enums ─────────────────────────────────────────────────────────────────────

const PlatformEnum = z.enum(['ZOOM', 'GOOGLE_MEET', 'TEAMS', 'WEBEX', 'MANUAL'])

const MeetingStatusEnum = z.enum([
  'SCHEDULED',
  'BOT_JOINING',
  'RECORDING',
  'PROCESSING',
  'DONE',
  'FAILED',
  'CANCELLED',
])

// ── Create Meeting Schema ─────────────────────────────────────────────────────

/**
 * POST /api/v1/meetings
 * Cross-field validation: meetingUrl must match the declared platform pattern.
 */
export const createMeetingSchema = {
  body: z
    .object({
      title: z
        .string()
        .min(1, 'Title cannot be empty')
        .max(500, 'Title must be 500 characters or less')
        .trim(),

      platform: PlatformEnum,

      meetingUrl: z
        .string()
        .url('meetingUrl must be a valid URL')
        .max(2048, 'URL is too long'),

      scheduledAt: z
        .string()
        .datetime({ message: 'scheduledAt must be a valid ISO 8601 datetime' })
        .refine(
          (dateStr) => new Date(dateStr) > new Date(),
          'scheduledAt must be in the future'
        ),

      calendarEventId: z
        .string()
        .max(500, 'calendarEventId must be 500 characters or less')
        .optional(),
    })
    .superRefine((data, ctx) => {
      // Cross-field: URL must match declared platform
      if (data.platform !== 'MANUAL' && data.meetingUrl) {
        if (!urlMatchesPlatform(data.meetingUrl, data.platform)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Meeting URL does not match platform '${data.platform}'. Provide a valid ${data.platform} URL or set platform to MANUAL.`,
            path: ['meetingUrl'],
          })
        }
      }
    }),
}

// ── List Meetings Query Schema ────────────────────────────────────────────────

/**
 * GET /api/v1/meetings
 * All params optional — defaults applied here.
 */
export const listMeetingsSchema = {
  query: z.object({
    status: z
      .preprocess(
        (val) => {
          if (typeof val === 'string') {
            return val.includes(',') ? val.split(',') : [val]
          }
          return val;
        },
        z.union([MeetingStatusEnum, z.array(MeetingStatusEnum)])
      )
      .optional(),

    platform: PlatformEnum.optional(),

    from: z
      .string()
      .datetime({ message: 'from must be a valid ISO 8601 datetime' })
      .optional(),

    to: z
      .string()
      .datetime({ message: 'to must be a valid ISO 8601 datetime' })
      .optional(),

    search: z
      .string()
      .max(200, 'search must be 200 characters or less')
      .optional(),

    limit: z.coerce
      .number()
      .int()
      .min(1, 'limit must be at least 1')
      .max(100, 'limit must be 100 or less')
      .default(20),

    cursor: z.string().optional(),

    sortBy: z
      .enum(['scheduledAt', 'createdAt', 'title'])
      .default('scheduledAt'),

    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
}

// ── Get Meeting Query Schema ──────────────────────────────────────────────────

const VALID_INCLUDE_VALUES = ['participants', 'commitments', 'actionItems', 'decisions', 'blockers'] as const

/**
 * GET /api/v1/meetings/:meetingId
 * ?include=participants,commitments,actionItems
 */
export const getMeetingSchema = {
  query: z.object({
    include: z
      .string()
      .optional()
      .transform((val) => {
        if (!val) return VALID_INCLUDE_VALUES.slice() as string[]
        return val
          .split(',')
          .map((s) => s.trim())
          .filter((s) => VALID_INCLUDE_VALUES.includes(s as any))
      }),
  }),
}

// ── Get Transcript Query Schema ───────────────────────────────────────────────

/**
 * GET /api/v1/meetings/:meetingId/transcript
 */
export const getTranscriptSchema = {
  query: z
    .object({
      search: z
        .string()
        .max(200, 'search must be 200 characters or less')
        .optional(),

      speaker: z
        .string()
        .email('speaker must be a valid email address')
        .optional(),

      fromTime: z.coerce
        .number()
        .min(0, 'fromTime must be non-negative')
        .optional(),

      toTime: z.coerce
        .number()
        .min(0, 'toTime must be non-negative')
        .optional(),
    })
    .superRefine((data, ctx) => {
      if (data.fromTime !== undefined && data.toTime !== undefined) {
        if (data.toTime <= data.fromTime) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'toTime must be greater than fromTime',
            path: ['toTime'],
          })
        }
      }
    }),
}

// ── Add Bot Schema ────────────────────────────────────────────────────────────

/**
 * POST /api/v1/meetings/bot/add
 */
export const addBotSchema = {
  body: z.object({
    meetingUrl: z
      .string()
      .url('meetingUrl must be a valid URL')
      .max(2048, 'URL is too long'),
  }),
}

// ── Delete Meeting Query Schema ───────────────────────────────────────────────

/**
 * DELETE /api/v1/meetings/:meetingId
 */
export const deleteMeetingSchema = {
  query: z.object({
    deleteTranscript: z
      .enum(['true', 'false'])
      .default('false')
      .transform((val) => val === 'true'),
  }),
}

// ── Meeting ID Param Schema ───────────────────────────────────────────────────

export const meetingIdParamSchema = {
  params: z.object({
    meetingId: z
      .string()
      .min(1, 'meetingId cannot be empty'),
  }),
}
