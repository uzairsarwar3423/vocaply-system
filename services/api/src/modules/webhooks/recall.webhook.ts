import { Request, Response } from 'express'
import { logger } from '../../config/logger'
import { transcribeQueue, notifyQueue } from '../../queues/queue.client'
import { mongoService } from '../../services/mongo.service'
import { redis } from '../../config/redis'
import { prisma } from '../../db/client'
import { verifyRecallSignature } from './webhooks.validator'
import { ExtractJobData } from '../../queues/jobs/extract.job'
import { updateMeetingStatus } from '../meetings/meetings.service'
import { TERMINAL_STATES } from '../meetings/meetings.service.state'
import { getTranscript } from '../../services/recall.service'
import { SERVER_EVENTS } from '../../realtime/socket.events'
import { teamRoom } from '../../realtime/rooms.manager'

export async function handleRecallWebhook(req: Request, res: Response): Promise<void> {
  // 1. Verify signature FIRST — reject immediately if invalid
  try {
    verifyRecallSignature(req)
  } catch (error) {
    logger.warn({ error }, 'Recall.ai webhook signature verification failed')
    res.status(400).json({ received: false, error: 'Invalid signature' })
    return
  }

  const { event, data } = req.body
  const botId = data?.bot?.id || data?.bot_id

  if (!botId) {
    logger.warn({ event }, 'Recall webhook missing bot ID in payload — ignoring')
    res.status(400).json({ received: false, error: 'Missing bot_id' })
    return
  }

  // Idempotency check with SET NX
  const idempotencyKey = `webhook:processed:recall:${botId}:${event}`
  const isNew = await redis.set(idempotencyKey, '1', 'EX', 86400, 'NX')
  if (!isNew) {
    logger.info({ event, botId }, 'Recall webhook already processed — skipping')
    res.status(200).json({ received: true })
    return
  }

  // 2. Acknowledge immediately
  res.status(200).json({ received: true })

  // 3. Route event to handler
  try {
    switch (event) {
      case 'bot.joining_call':
        await handleBotJoining(botId)
        break
      case 'bot.in_waiting_room':
        logger.info({ botId }, 'Bot in waiting room')
        break
      case 'bot.recording_started':
      case 'bot.in_call_recording':
        await handleRecordingStarted(botId)
        break
      case 'bot.done':
        await handleBotDone(data, botId)
        break
      case 'bot.failed':
        await handleBotFailed(botId, data.reason || data.bot?.status?.sub_code)
        break
      case 'analysis_done':
      case 'analyze_done':
      case 'bot.analysis_done':
      case 'transcript.done':
        await handleAnalysisDone(data, botId)
        break
      default:
        logger.warn({ event }, 'Unknown Recall.ai event — ignoring')
    }
  } catch (err) {
    logger.error({ event, err }, 'Error processing Recall.ai webhook')
    if (data?.bot_id) {
      const meeting = await findMeetingByBotId(data.bot_id).catch(() => null)
      // Only attempt FAILED transition if not already in a terminal state
      if (meeting && !TERMINAL_STATES.has(meeting.status)) {
        await updateMeetingStatus(meeting.id, 'FAILED', { processingError: 'Internal processing error' }).catch((e) => logger.error({ err: e }, 'Fallback FAILED update also failed'))
      }
    }
  }
}

// ── EVENT HANDLERS ────────────────────────────────────────────────────────────

async function handleBotJoining(botId: string): Promise<void> {
  const meeting = await findMeetingByBotId(botId)
  if (!meeting || TERMINAL_STATES.has(meeting.status as any)) return
  await updateMeetingStatus(meeting.id, 'BOT_JOINING')

  try {
    const { getIO } = await import('../../realtime/socket.server')
    getIO().to(teamRoom(meeting.teamId)).emit(SERVER_EVENTS.MEETING_BOT_JOINING, {
      meetingId: meeting.id,
    })
  } catch (e) { }
}

async function handleRecordingStarted(botId: string): Promise<void> {
  const meeting = await findMeetingByBotId(botId)
  if (!meeting || TERMINAL_STATES.has(meeting.status as any)) return
  await updateMeetingStatus(meeting.id, 'RECORDING', { startedAt: new Date() })

  try {
    const { getIO } = await import('../../realtime/socket.server')
    getIO().to(teamRoom(meeting.teamId)).emit(SERVER_EVENTS.MEETING_RECORDING, {
      meetingId: meeting.id,
      startedAt: new Date().toISOString(),
    })
  } catch (e) { }
}

async function handleBotDone(data: any, botId: string): Promise<void> {
  const meeting = await findMeetingByBotId(botId)
  if (!meeting) {
    logger.error({ botId }, 'bot.done received for unknown bot')
    return
  }
  if (TERMINAL_STATES.has(meeting.status as any)) {
    logger.info({ meetingId: meeting.id, status: meeting.status }, 'Meeting already in terminal state, ignoring bot.done')
    return
  }

  const now = new Date()
  const durationMinutes = meeting.startedAt
    ? Math.round((now.getTime() - meeting.startedAt.getTime()) / 60000)
    : 0

  // Fetch the full transcript from Recall.ai API instead of relying on payload
  let rawTranscript = data.transcript ?? data.bot?.transcript ?? []
  if (!rawTranscript || rawTranscript.length === 0) {
    rawTranscript = await getTranscript(botId)
  }

  // Store raw transcript in MongoDB
  const normalizedTranscript = normalizeRecallTranscript(rawTranscript)
  const fullText = buildFullText(normalizedTranscript)

  const mongoTranscriptId = await mongoService.storeTranscript({
    meeting_id: meeting.id,
    team_id: meeting.teamId,
    recall_bot_id: botId,
    platform: meeting.platform?.toLowerCase() || 'unknown',
    raw_transcript: rawTranscript,
    normalized_transcript: normalizedTranscript,
    full_text: fullText,
    processing_status: 'pending',
    created_at: new Date(),
  })

  // Combined update to meeting
  await updateMeetingStatus(meeting.id, 'PROCESSING', {
    endedAt: now,
    durationMinutes,
    mongoTranscriptId,
  })

  try {
    const { getIO } = await import('../../realtime/socket.server')
    getIO().to(teamRoom(meeting.teamId)).emit(SERVER_EVENTS.MEETING_PROCESSING, {
      meetingId: meeting.id,
    })
  } catch (e) { }

  if (rawTranscript.length > 0) {
    await transcribeQueue.add('process-transcript', {
      meetingId: meeting.id,
      teamId: meeting.teamId,
      mongoTranscriptId,
    } satisfies ExtractJobData, {
      priority: 2,
    })
  } else {
    logger.info({ meetingId: meeting.id }, 'Transcript not ready at bot.done, waiting for analysis_done')
  }
}

async function handleBotFailed(botId: string, reason: string): Promise<void> {
  const meeting = await findMeetingByBotId(botId)
  if (!meeting || TERMINAL_STATES.has(meeting.status as any)) return
  await updateMeetingStatus(meeting.id, 'FAILED', { processingError: reason })

  try {
    const { getIO } = await import('../../realtime/socket.server')
    getIO().to(teamRoom(meeting.teamId)).emit(SERVER_EVENTS.MEETING_FAILED, {
      meetingId: meeting.id,
      reason,
    })
  } catch (e) { }

  await notifyQueue.add('meeting-failed', {
    type: 'MEETING_FAILED',
    teamId: meeting.teamId,
    meetingId: meeting.id,
  })
}

async function handleAnalysisDone(data: any, botId: string): Promise<void> {
  const meeting = await findMeetingByBotId(botId)
  if (!meeting) return
  
  logger.info({ meetingId: meeting.id, botId }, 'Received analysis_done webhook from Recall.ai')
  
  // If the meeting is already fully processed (e.g. COMPLETED), we might not want to re-run everything
  // but if it's missing a transcript, this could be the async fallback.
  // For now, if the status is PROCESSING, it means the bot is done and we were waiting for transcript.
  // Since we also fetch on bot.done, this acts as a safety net if Recall.ai API didn't have it ready on bot.done.
  
  // We can fetch the transcript again and update MongoDB
  const rawTranscript = await getTranscript(botId)
  if (rawTranscript && rawTranscript.length > 0) {
    logger.info({ meetingId: meeting.id }, `Fetched late transcript (${rawTranscript.length} segments)`)
    
    if (meeting.mongoTranscriptId) {
      const normalizedTranscript = normalizeRecallTranscript(rawTranscript)
      await mongoService.updateTranscript(meeting.mongoTranscriptId, {
        raw_transcript: rawTranscript,
        normalized_transcript: normalizedTranscript,
        full_text: buildFullText(normalizedTranscript),
      })
      
      if (meeting.status === 'PROCESSING') {
        logger.info({ meetingId: meeting.id }, 'Late transcript saved, triggering transcribe worker')
        await transcribeQueue.add('process-transcript', {
          meetingId: meeting.id,
          teamId: meeting.teamId,
          mongoTranscriptId: meeting.mongoTranscriptId,
        } satisfies ExtractJobData, {
          priority: 2,
        })
      }
    }
  }
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

async function findMeetingByBotId(botId: string) {
  return prisma.meeting.findFirst({
    where: { recallBotId: botId },
  })
}

export interface NormalizedUtterance {
  speaker: string;
  text: string;
  startTime: number;
  endTime: number;
  language: string;
}

export function normalizeRecallTranscript(rawTranscript: any[]): NormalizedUtterance[] {
  if (!Array.isArray(rawTranscript)) return []

  return rawTranscript.map((segment) => {
    // 1. Resolve Speaker Name
    let speaker = 'Unknown'
    if (segment.participant?.name) {
      speaker = segment.participant.name
    } else if (segment.speaker_name) {
      speaker = segment.speaker_name
    } else if (segment.speaker_tag) {
      speaker = segment.speaker_tag
    } else if (typeof segment.speaker === 'string') {
      speaker = segment.speaker
    }

    // 2. Resolve Text
    let text = ''
    if (typeof segment.text === 'string' && segment.text.trim().length > 0) {
      text = segment.text.trim()
    } else if (Array.isArray(segment.words)) {
      text = segment.words.map((w: any) => w.text).join(' ').trim()
    }

    // 3. Resolve Timestamps
    let startTime = 0
    let endTime = 0
    if (typeof segment.start_time === 'number') startTime = segment.start_time
    else if (typeof segment.start_timestamp === 'number') startTime = segment.start_timestamp
    else if (Array.isArray(segment.words) && segment.words.length > 0) {
      startTime = segment.words[0].start_timestamp || 0
    }

    if (typeof segment.end_time === 'number') endTime = segment.end_time
    else if (typeof segment.end_timestamp === 'number') endTime = segment.end_timestamp
    else if (Array.isArray(segment.words) && segment.words.length > 0) {
      endTime = segment.words[segment.words.length - 1].end_timestamp || 0
    }

    // 4. Resolve Language
    const language = segment.language_code || segment.language || 'unknown'

    return { speaker, text, startTime, endTime, language }
  })
}

function buildFullText(normalizedTranscript: NormalizedUtterance[]): string {
  return normalizedTranscript
    .map((t) => `${t.speaker} [${formatTime(t.startTime)}]: ${t.text}`)
    .join('\n')
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
