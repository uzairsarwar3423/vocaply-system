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

    const participantMap: Record<string, any> = {}
    for (const p of participants) {
      if (p.speakerTag) {
        participantMap[p.speakerTag] = {
          user_id: p.userId ?? null,
          name: p.name || 'Unknown',
          email: p.email ?? null,
          speaker_tag: p.speakerTag
        }
      }
    }

    const aiPipelineUrl = process.env.AI_PIPELINE_URL || 'http://localhost:8001'
    const secret = process.env.INTERNAL_API_SECRET || ''

    // We must lazily import axios because this is a worker environment
    const axios = (await import('axios')).default

    logger.info({ jobId: job.id, meetingId }, 'transcribe.worker: Calling Python AI Pipeline for cleanup')
    
    let cleaned_transcript = transcript.raw_transcript // Fallback
    let cleanup_metadata = null

    try {
      const response = await axios.post(`${aiPipelineUrl}/api/v1/transcripts/cleanup`, {
        meeting_id: meetingId,
        team_id: teamId,
        raw_transcript: transcript.raw_transcript,
        participants: participantMap
      }, {
        headers: {
          'X-Internal-Service-Key': secret
        }
      })
      cleaned_transcript = response.data.cleaned_transcript
      cleanup_metadata = response.data.metadata
      logger.info({ jobId: job.id, meetingId }, 'transcribe.worker: Python cleanup successful')
    } catch (error: any) {
      const errData = error.response?.data;
      if (errData?.error_code === 'TIMESTAMP_INTEGRITY_ERROR') {
        logger.error({ 
          jobId: job.id, 
          meetingId, 
          violations: errData.details?.violations 
        }, 'transcribe.worker: Timestamp integrity validation failed in Python AI Pipeline. Job must fail.')
        throw new Error(`Timestamp integrity validation failed: ${JSON.stringify(errData.details?.violations)}`)
      }

      logger.error({ 
        jobId: job.id, 
        meetingId, 
        err: errData || error.message 
      }, 'transcribe.worker: Python cleanup failed, falling back to raw transcript')
      // If Python fails (for other reasons like rate limits), we gracefully degrade by just skipping cleanup 
      // and passing the raw transcript downstream as normalized, so extraction can still run.
    }

    await mongoService.updateTranscript(mongoTranscriptId, {
      normalized_transcript: cleaned_transcript, // Store the result in normalized_transcript so the rest of the app works
      cleanup_metadata: cleanup_metadata,
      processing_status: 'ready_for_extraction',
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
