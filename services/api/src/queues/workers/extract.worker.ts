import { Worker, Job } from 'bullmq'
import { logger } from '../../config/logger'
import { prisma } from '../../db/client'
import { mongoService } from '../../services/mongo.service'
import { notifyQueue } from '../queue.client'
import { ExtractJobData } from '../jobs/extract.job'
import { SERVER_EVENTS } from '../../realtime/socket.events'
import { teamRoom } from '../../realtime/rooms.manager'

export const extractWorker = new Worker<ExtractJobData>(
  'extract',
  async (job: Job<ExtractJobData>) => {
    const { meetingId, teamId, mongoTranscriptId } = job.data
    logger.info({ jobId: job.id, meetingId }, 'extract.worker: processing (mock mode)')

    const mockResult = {
      commitments: [],
      actionItems: [],
      decisions:   [],
      blockers:    [],
      summary:     'AI extraction pending — pipeline not yet configured.',
    }

    await prisma.meeting.update({
      where: { id: meetingId },
      data:  {
        status:                 'DONE',
        summary:                mockResult.summary,
        processingCompletedAt:  new Date(),
      },
    })

    await mongoService.updateTranscript(mongoTranscriptId, {
      ai_extraction:           mockResult,
      processing_status:       'done',
      processing_completed_at: new Date(),
    })

    try {
      const { socketEmitter } = await import('../../realtime/socket.emitter')
      socketEmitter.to(teamRoom(teamId)).emit(SERVER_EVENTS.MEETING_PROCESSED, {
        meetingId,
        summary:         mockResult.summary,
        commitmentCount: 0,
        actionItemCount: 0,
      })
    } catch (e) {
      logger.warn({ err: e }, 'Socket emit failed in extract.worker')
    }

    await notifyQueue.add('meeting-processed', {
      type:      'MEETING_PROCESSED',
      teamId,
      meetingId,
    })

    logger.info({ jobId: job.id, meetingId }, 'extract.worker: done')
  },
  {
    connection: { host: process.env.REDIS_HOST, port: parseInt(process.env.REDIS_PORT ?? '6379') },
    concurrency: parseInt(process.env.WORKER_CONCURRENCY_EXTRACT || '3', 10),
  }
)

extractWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'extract.worker: job failed')
})
