// ─────────────────────────────────────────────────────────────────────────────
// meetings.routes.ts — Route Definitions + Middleware Chains
//
// CRITICAL ROUTE ORDERING:
//   /meetings/bot/add MUST be registered BEFORE /meetings/:meetingId
//   Express matches routes top-to-bottom. "bot" would be parsed as meetingId
//   if the parameterized route is registered first.
//
// Middleware chain order per route:
//   requireAuth     → validates JWT, sets req.user
//   injectTenant    → extracts teamId from JWT, sets req.teamId
//   checkMeetingLimit → quota enforcement (only on creation endpoints)
//   requireRole     → role-based access control (only on admin endpoints)
//   validate()      → Zod schema validation
//   controller      → HTTP handler
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.middleware'
import { injectTenant } from '../../middleware/tenant.middleware'
import { checkMeetingLimit } from '../../middleware/plan-limits.middleware'
import { requireRole } from '../../middleware/role.middleware'
import { validate } from '../../middleware/validate.middleware'
import {
  createMeetingSchema,
  listMeetingsSchema,
  getMeetingSchema,
  getTranscriptSchema,
  addBotSchema,
  deleteMeetingSchema,
  meetingIdParamSchema,
} from './meetings.validator'
import {
  createMeetingController,
  listMeetingsController,
  getMeetingController,
  getTranscriptController,
  addBotController,
  removeBotController,
  deleteMeetingController,
} from './meetings.controller'

export const meetingsRouter = Router()

// ─────────────────────────────────────────────────────────────────────────────
// POST /meetings/bot/add
// ⚠ MUST be registered BEFORE /meetings/:meetingId
// ─────────────────────────────────────────────────────────────────────────────
meetingsRouter.post(
  '/bot/add',
  requireAuth,
  injectTenant,
  checkMeetingLimit,
  validate(addBotSchema),
  addBotController
)

// ─────────────────────────────────────────────────────────────────────────────
// POST /meetings — Create Meeting
// ─────────────────────────────────────────────────────────────────────────────
meetingsRouter.post(
  '/',
  requireAuth,
  injectTenant,
  checkMeetingLimit,
  validate(createMeetingSchema),
  createMeetingController
)

// ─────────────────────────────────────────────────────────────────────────────
// GET /meetings — List Meetings (cursor paginated)
// ─────────────────────────────────────────────────────────────────────────────
meetingsRouter.get(
  '/',
  requireAuth,
  injectTenant,
  validate(listMeetingsSchema),
  listMeetingsController
)

// ─────────────────────────────────────────────────────────────────────────────
// GET /meetings/:meetingId — Get Meeting Detail
// ─────────────────────────────────────────────────────────────────────────────
meetingsRouter.get(
  '/:meetingId',
  requireAuth,
  injectTenant,
  validate({ ...meetingIdParamSchema, ...getMeetingSchema }),
  getMeetingController
)

// ─────────────────────────────────────────────────────────────────────────────
// GET /meetings/:meetingId/transcript — Get Transcript
// ─────────────────────────────────────────────────────────────────────────────
meetingsRouter.get(
  '/:meetingId/transcript',
  requireAuth,
  injectTenant,
  validate({ ...meetingIdParamSchema, ...getTranscriptSchema }),
  getTranscriptController
)

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /meetings/:meetingId/bot — Remove Bot (cancel recording)
// ─────────────────────────────────────────────────────────────────────────────
meetingsRouter.delete(
  '/:meetingId/bot',
  requireAuth,
  injectTenant,
  validate(meetingIdParamSchema),
  removeBotController
)

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /meetings/:meetingId — Delete Meeting (ADMIN+ only)
// ─────────────────────────────────────────────────────────────────────────────
meetingsRouter.delete(
  '/:meetingId',
  requireAuth,
  injectTenant,
  requireRole('ADMIN'),
  validate({ ...meetingIdParamSchema, ...deleteMeetingSchema }),
  deleteMeetingController
)

// ─────────────────────────────────────────────────────────────────────────────
// POST /meetings/:meetingId/simulate-complete (Development ONLY)
// ─────────────────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'development') {
  const { prisma } = require('../../db/client')
  const { mongoService } = require('../../services/mongo.service')
  const { transcribeQueue } = require('../../queues/queue.client')
  const { teamRoom } = require('../../realtime/rooms.manager')
  const { SERVER_EVENTS } = require('../../realtime/socket.events')
  const { asyncHandler } = require('../../utils/async-handler')
  const { updateMeetingStatus } = require('./meetings.service')

  meetingsRouter.post(
    '/:meetingId/simulate-complete',
    requireAuth,
    injectTenant,
    validate(meetingIdParamSchema),
    asyncHandler(async (req: any, res: any) => {
      const meetingId = req.params.meetingId
      const meeting = await prisma.meeting.findUnique({
        where: { id: meetingId },
      })

      if (!meeting) {
        return res.status(404).json({ success: false, message: 'Meeting not found' })
      }

      if (meeting.status === 'DONE' || meeting.status === 'FAILED' || meeting.status === 'CANCELLED') {
        return res.status(400).json({
          success: false,
          message: `Meeting is already in terminal state: ${meeting.status}`,
        })
      }

      const botId = meeting.recallBotId || `bot_sim_${Date.now()}`
      if (!meeting.recallBotId) {
        await prisma.meeting.update({
          where: { id: meetingId },
          data: { recallBotId: botId },
        })
      }

      const mockTranscript = [
        { speaker_tag: 'Speaker 1', text: 'Hello everyone, thank you for joining the sync meeting today.', start_time: 0, end_time: 4 },
        { speaker_tag: 'Speaker 2', text: 'Hey! Yes, we need to discuss the upcoming release candidate.', start_time: 5, end_time: 10 },
        { speaker_tag: 'Speaker 1', text: 'For the release, I will commit to deploying the frontend updates by Tuesday.', start_time: 11, end_time: 15 },
        { speaker_tag: 'Speaker 2', text: 'Perfect. I will take care of updating the API routes.', start_time: 16, end_time: 20 },
        { speaker_tag: 'Speaker 1', text: 'Let’s make sure we also update the documentation.', start_time: 21, end_time: 25 },
        { speaker_tag: 'Speaker 2', text: 'Great. Let’s decide to launch on Wednesday at 10 AM EST.', start_time: 26, end_time: 30 }
      ]

      const mongoTranscriptId = await mongoService.storeTranscript({
        meeting_id: meeting.id,
        team_id: meeting.teamId,
        recall_bot_id: botId,
        platform: meeting.platform?.toLowerCase() || 'unknown',
        raw_transcript: mockTranscript,
        full_text: mockTranscript.map(t => `${t.speaker_tag}: ${t.text}`).join('\n'),
        processing_status: 'pending',
        created_at: new Date()
      })

      await updateMeetingStatus(meeting.id, 'PROCESSING', {
        endedAt: new Date(),
        durationMinutes: 5,
        mongoTranscriptId
      })

      try {
        const { getIO } = await import('../../realtime/socket.server')
        getIO().to(teamRoom(meeting.teamId)).emit(SERVER_EVENTS.MEETING_PROCESSING, {
          meetingId: meeting.id,
        })
      } catch (e) {}

      await transcribeQueue.add('process-transcript', {
        meetingId: meeting.id,
        teamId: meeting.teamId,
        mongoTranscriptId,
      }, { priority: 2 })

      res.status(200).json({
        success: true,
        message: 'Simulation initiated. Status set to PROCESSING. Queue job dispatched.',
        meetingId: meeting.id
      })
    })
  )
}

