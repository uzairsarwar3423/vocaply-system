import { Worker, Job } from 'bullmq'
import { logger } from '../../config/logger'
import { mongoService } from '../../services/mongo.service'
import { extractQueue } from '../queue.client'
import { prisma } from '../../db/client'
import { TranscribeJobData } from '../jobs/transcribe.job'
import { ExtractJobData } from '../jobs/extract.job'

export const transcribeWorker = new Worker<TranscribeJobData>(
  'transcribe',
  async (job: Job<TranscribeJobData>) => {
    const { meetingId, teamId, mongoTranscriptId } = job.data
    logger.info({ jobId: job.id, meetingId }, 'transcribe.worker: processing')

    const transcript = await mongoService.findTranscript(mongoTranscriptId)
    if (!transcript) {
      throw new Error(`Transcript not found in MongoDB: ${mongoTranscriptId}`)
    }

    const participants = await prisma.meetingParticipant.findMany({
      where: { meetingId },
    })

    const speakerMap: Record<string, { userId?: string; name: string; email?: string }> = {}
    const nameMap: Record<string, { userId?: string; name: string; email?: string }> = {}

    for (const p of participants) {
      const info = {
        userId: p.userId ?? undefined,
        name:   p.name,
        email:  p.email ?? undefined,
      }
      if (p.speakerTag) {
        speakerMap[p.speakerTag.toLowerCase()] = info
      }
      if (p.name) {
        nameMap[p.name.toLowerCase()] = info
      }
      if (p.email) {
        nameMap[p.email.toLowerCase()] = info
      }
    }

    const enrichedTurns = transcript.raw_transcript.map((turn: any) => {
      let key = ""
      if (turn.speaker_tag) {
        key = turn.speaker_tag
      } else if (turn.participant?.name) {
        key = turn.participant.name
      } else if (turn.speaker_name) {
        key = turn.speaker_name
      } else if (typeof turn.speaker === "string") {
        key = turn.speaker
      }

      const match = speakerMap[key.toLowerCase()] || nameMap[key.toLowerCase()]

      return {
        ...turn,
        speaker_user_id: match?.userId ?? null,
        speaker_name:    match?.name ?? (key || "Unknown Speaker"),
        speaker_email:   match?.email ?? null,
      }
    })

    const enrichedNormalizedTurns = Array.isArray(transcript.normalized_transcript)
      ? transcript.normalized_transcript.map((turn: any) => {
          const key = turn.speaker || ""
          const match = nameMap[key.toLowerCase()] || speakerMap[key.toLowerCase()]
          return {
            ...turn,
            speaker_user_id: match?.userId ?? null,
            speaker:         match?.name ?? (key || "Unknown Speaker"),
            speaker_email:   match?.email ?? null,
          }
        })
      : []

    await mongoService.updateTranscript(mongoTranscriptId, {
      raw_transcript:        enrichedTurns,
      normalized_transcript: enrichedNormalizedTurns,
      processing_status:     'ready_for_extraction',
    })

    await extractQueue.add(
      'extract-commitments',
      { meetingId, teamId, mongoTranscriptId } satisfies ExtractJobData,
      { priority: 2 }
    )

    logger.info({ jobId: job.id, meetingId }, 'transcribe.worker: done, pushed to extract queue')
  },
  {
    connection: { host: process.env.REDIS_HOST, port: parseInt(process.env.REDIS_PORT ?? '6379') },
    concurrency: parseInt(process.env.WORKER_CONCURRENCY_TRANSCRIBE || '5', 10),
  }
)

transcribeWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'transcribe.worker: job failed')
})
