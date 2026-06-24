import { Worker, Job } from 'bullmq'
import { logger } from '../../config/logger'
import { NotifyJobData } from '../jobs/notify.job'
import { prisma } from '../../db/client'
import { emailService } from '../../modules/notifications/email.service'
import { env } from '../../config/env'

const frontendUrl = env.FRONTEND_URL || 'http://localhost:3000'

async function shouldSendEmail(userId: string, notificationType: string): Promise<boolean> {
  const pref = await prisma.notificationPreference.findUnique({
    where: { userId }
  })
  if (!pref || !pref.preferences) return true // Default: send email
  const userPrefs = pref.preferences as any
  if (userPrefs.email && userPrefs.email[notificationType] === false) {
    return false
  }
  return true
}

export const notifyWorker = new Worker<NotifyJobData>(
  'notify',
  async (job: Job<NotifyJobData>) => {
    const { type, teamId, meetingId, commitmentId, ownerId, managerIds } = job.data
    logger.info({ jobId: job.id, type, teamId }, 'notify.worker: processing notification dispatch')

    // ─────────────────────────────────────────────────────────────────────────
    // CASE 1: MEETING_PROCESSED
    // ─────────────────────────────────────────────────────────────────────────
    if (type === 'MEETING_PROCESSED' && meetingId) {
      const meeting = await prisma.meeting.findUnique({
        where: { id: meetingId }
      })

      if (!meeting) {
        throw new Error(`Meeting ${meetingId} not found for notification dispatch`)
      }

      // Fetch all users in the team
      const members = await prisma.user.findMany({
        where: { teamId }
      })

      for (const member of members) {
        // Create In-App Notification
        await prisma.inAppNotification.create({
          data: {
            userId: member.id,
            teamId,
            type: 'MEETING_PROCESSED',
            title: `Meeting processed: ${meeting.title}`,
            body: meeting.summary ? meeting.summary.substring(0, 150) + '...' : 'Meeting summary is ready.',
            meetingId: meeting.id,
            actionUrl: `/meetings/${meeting.id}`
          }
        })

        // Check user email preferences
        const emailAllowed = await shouldSendEmail(member.id, 'MEETING_PROCESSED')
        if (emailAllowed) {
          try {
            await emailService.sendMeetingSummary({
              to: member.email,
              name: member.name,
              meetingTitle: meeting.title,
              summary: meeting.summary || 'Summary extraction completed.',
              commitmentsCount: meeting.commitmentCount,
              actionItemsCount: meeting.actionItemCount,
              viewUrl: `${frontendUrl}/meetings/${meeting.id}`
            })
          } catch (err) {
            logger.error({ err, userId: member.id }, 'notify.worker: failed sending meeting summary email')
          }
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CASE 2: COMMITMENT_MISSED
    // ─────────────────────────────────────────────────────────────────────────
    else if (type === 'COMMITMENT_MISSED' && commitmentId) {
      const commitment = await prisma.commitment.findUnique({
        where: { id: commitmentId },
        include: { owner: true }
      })

      if (!commitment) {
        throw new Error(`Commitment ${commitmentId} not found for notification dispatch`)
      }

      const { owner } = commitment

      // 1. Notify Assignee / Owner
      await prisma.inAppNotification.create({
        data: {
          userId: owner.id,
          teamId,
          type: 'COMMITMENT_MISSED',
          title: '⚠️ Commitment Overdue',
          body: `You missed the deadline for: "${commitment.text}"`,
          commitmentId: commitment.id,
          actionUrl: `/commitments`
        }
      })

      const ownerEmailAllowed = await shouldSendEmail(owner.id, 'COMMITMENT_MISSED')
      if (ownerEmailAllowed) {
        try {
          await emailService.sendCommitmentMissed({
            to: owner.email,
            name: owner.name,
            commitmentText: commitment.text,
            dueDate: commitment.dueDate || new Date(),
            actionUrl: `${frontendUrl}/commitments`
          })
        } catch (err) {
          logger.error({ err, userId: owner.id }, 'notify.worker: failed sending commitment missed email')
        }
      }

      // 2. Notify Team Managers / Admins
      let managersToNotify: string[] = managerIds || []
      if (managersToNotify.length === 0) {
        const managers = await prisma.user.findMany({
          where: {
            teamId,
            role: { in: ['OWNER', 'ADMIN', 'MANAGER'] }
          }
        })
        managersToNotify = managers.map(m => m.id)
      }

      for (const managerId of managersToNotify) {
        // Don't notify the owner again if they are also a manager
        if (managerId === owner.id) continue

        const manager = await prisma.user.findUnique({ where: { id: managerId } })
        if (!manager) continue

        await prisma.inAppNotification.create({
          data: {
            userId: manager.id,
            teamId,
            type: 'COMMITMENT_MISSED',
            title: `⚠️ Team Overdue Commitment: ${owner.name}`,
            body: `${owner.name} missed the deadline for: "${commitment.text}"`,
            commitmentId: commitment.id,
            actionUrl: `/dashboard`
          }
        })

        const mgrEmailAllowed = await shouldSendEmail(manager.id, 'COMMITMENT_MISSED')
        if (mgrEmailAllowed) {
          try {
            await emailService.sendManagerAlert({
              to: manager.email,
              name: manager.name,
              assigneeName: owner.name,
              commitmentText: commitment.text,
              dueDate: commitment.dueDate || new Date(),
              actionUrl: `${frontendUrl}/dashboard`
            })
          } catch (err) {
            logger.error({ err, managerId }, 'notify.worker: failed sending manager alert email')
          }
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CASE 3: DEADLINE_REMINDER
    // ─────────────────────────────────────────────────────────────────────────
    else if (type === 'DEADLINE_REMINDER' && ownerId) {
      const user = await prisma.user.findUnique({
        where: { id: ownerId }
      })

      if (!user) {
        throw new Error(`User ${ownerId} not found for deadline reminder dispatch`)
      }

      // Fetch pending commitments due in next 48 hours
      const now = new Date()
      const endOfTomorrow = new Date()
      endOfTomorrow.setDate(now.getDate() + 2)

      const upcomingCommitments = await prisma.commitment.findMany({
        where: {
          ownerId,
          status: 'PENDING',
          dueDate: {
            gte: now,
            lte: endOfTomorrow
          }
        }
      })

      if (upcomingCommitments.length > 0) {
        // Create In-App Notification
        await prisma.inAppNotification.create({
          data: {
            userId: ownerId,
            teamId,
            type: 'DEADLINE_TODAY',
            title: `⏰ ${upcomingCommitments.length} Commitments Due Soon`,
            body: `You have ${upcomingCommitments.length} commitments coming due today or tomorrow.`,
            actionUrl: `/commitments`
          }
        })

        const emailAllowed = await shouldSendEmail(ownerId, 'DEADLINE_TODAY')
        if (emailAllowed) {
          try {
            await emailService.sendDeadlineReminder({
              to: user.email,
              name: user.name,
              commitments: upcomingCommitments.map(c => ({
                id: c.id,
                text: c.text,
                dueDate: c.dueDate || new Date()
              })),
              actionUrl: `${frontendUrl}/commitments`
            })
          } catch (err) {
            logger.error({ err, ownerId }, 'notify.worker: failed sending deadline reminder email')
          }
        }
      }
    }
  },
  {
    connection: { host: process.env.REDIS_HOST, port: parseInt(process.env.REDIS_PORT ?? '6379') },
    concurrency: parseInt(process.env.WORKER_CONCURRENCY_NOTIFY || '5', 10),
  }
)

notifyWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'notify.worker: job failed')
})
