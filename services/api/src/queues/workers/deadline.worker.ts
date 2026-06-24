import { Worker, Job } from 'bullmq'
import { logger } from '../../config/logger'
import { DeadlineJobData } from '../jobs/deadline.job'
import { prisma } from '../../db/client'
import { redis } from '../../config/redis'
import { notifyQueue } from '../queue.client'
import { addDays } from 'date-fns'
import { calculateCommitmentScore } from '../../services/score.service'
import { SERVER_EVENTS } from '../../realtime/socket.events'
import { teamRoom, userRoom } from '../../realtime/rooms.manager'

export const deadlineWorker = new Worker<DeadlineJobData>(
  'deadline',
  async (job: Job<DeadlineJobData>) => {
    logger.info({ jobId: job.id }, 'deadline.worker: processing (scaffold)')
  },
  {
    connection: { host: process.env.REDIS_HOST, port: parseInt(process.env.REDIS_PORT ?? '6379') },
    concurrency: parseInt(process.env.WORKER_CONCURRENCY_DEADLINE || '2', 10),
  }
)

deadlineWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'deadline.worker: job failed')
})

export async function runDeadlineReminders(): Promise<void> {
  const tomorrow = addDays(new Date(), 1)
  tomorrow.setUTCHours(23, 59, 59, 999)
  const now = new Date()

  // Find PENDING commitments due within 24 hours, reminder not yet sent
  const commitments = await prisma.commitment.findMany({
    where: {
      status: 'PENDING',
      dueDate: { gte: now, lte: tomorrow },
      reminderSentAt: null,
    },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      team: { select: { id: true, plan: true } },
    },
    take: 500, // Batch of 500
  })

  for (const c of commitments) {
    if (c.team.plan === 'FREE') continue // Notifications = paid feature

    // Dedup check
    const dedupKey = `notif:dedup:DEADLINE_REMINDER:${c.owner.id}:${c.id}`
    if (await redis.exists(dedupKey)) continue

    // Queue notification + mark reminder sent
    await notifyQueue.add('deadline-reminder', {
      type: 'DEADLINE_REMINDER',
      teamId: c.teamId,
      commitmentId: c.id,
      ownerId: c.owner.id,
    })
    await prisma.commitment.update({
      where: { id: c.id },
      data: { reminderSentAt: new Date() },
    })
    await redis.setex(dedupKey, 86400, '1')
  }
}

export async function markMissedCommitments(): Promise<void> {
  // Find PENDING commitments past their due date, not yet alerted
  const overdue = await prisma.commitment.findMany({
    where: {
      status: 'PENDING',
      dueDate: { lt: new Date() },
      missedAlertSentAt: null,
    },
    include: {
      owner: true,
      team: { include: { members: { where: { role: { in: ['MANAGER', 'ADMIN', 'OWNER'] } } } } },
    },
    take: 500,
  })

  if (overdue.length === 0) return

  // Batch update all to MISSED
  const ids = overdue.map((c) => c.id)
  await prisma.commitment.updateMany({
    where: { id: { in: ids } },
    data: { status: 'MISSED', missedAlertSentAt: new Date() },
  })

  // Per-commitment: emit Socket.io + queue notification + recalculate score
  for (const c of overdue) {
    // Socket.io — try/catch so realtime failure never blocks the batch DB update
    try {
      const { socketEmitter } = await import('../../realtime/socket.emitter')
      socketEmitter.to(teamRoom(c.teamId)).emit(SERVER_EVENTS.COMMITMENT_MISSED, {
        commitmentId: c.id,
        ownerName: c.owner.name,
      })
      socketEmitter.to(userRoom(c.ownerId)).emit(SERVER_EVENTS.MY_DEADLINE_MISSED, {
        commitmentId: c.id,
        text: c.text,
      })
    } catch (err) {
      logger.warn({ err, commitmentId: c.id }, 'deadline.worker: Socket.io emit failed (non-fatal)')
    }

    await notifyQueue.add('commitment-missed', {
      type: 'COMMITMENT_MISSED',
      teamId: c.teamId,
      commitmentId: c.id,
      ownerId: c.ownerId,
      managerIds: c.team.members.map((m) => m.id),
    })

    // Recalculate score
    const newScore = await calculateCommitmentScore(c.ownerId, c.teamId)
    await prisma.user.update({
      where: { id: c.ownerId },
      data: { commitmentScore: newScore.score },
    })
    
    try {
      const { socketEmitter } = await import('../../realtime/socket.emitter')
      socketEmitter.to(teamRoom(c.teamId)).emit(SERVER_EVENTS.MEMBER_SCORE_UPDATED, {
        userId: c.ownerId,
        newScore: newScore.score,
      })
    } catch (err) {
      logger.warn({ err, commitmentId: c.id }, 'deadline.worker: score emit failed (non-fatal)')
    }
  }
}
