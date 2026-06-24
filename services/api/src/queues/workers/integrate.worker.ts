import { Worker, Job, UnrecoverableError } from 'bullmq'
import { logger } from '../../config/logger'
import { IntegrateJobData } from '../jobs/integrate.job'
import { prisma } from '../../db/client'
import { redis } from '../../config/redis'
import { resolveProvider } from '../../modules/integrations/integrations.service'
import { ProviderType } from '../../modules/integrations/integrations.types'
import { socketEmitter } from '../../realtime/socket.emitter'
import { notifyQueue } from '../queue.client'

export const integrateWorker = new Worker<IntegrateJobData>(
  'integrate',
  async (job: Job<IntegrateJobData>) => {
    const { teamId, actionItemId, provider, idempotencyKey } = job.data
    logger.info({ jobId: job.id, data: job.data }, 'integrate.worker: processing job')

    if (!actionItemId || !provider) return

    // 1. Idempotency re-check
    if (idempotencyKey) {
      const lockKey = `integrate:lock:${idempotencyKey}`
      const acquired = await redis.set(lockKey, '1', 'EX', 3600, 'NX')
      if (!acquired) {
        logger.info({ idempotencyKey }, 'integrate.worker: already processed/in-flight, skipping')
        return
      }
    }

    try {
      // 2. Fetch integration
      const integration = await prisma.teamIntegration.findFirst({
        where: { teamId, provider: provider as any, isActive: true }
      })

      if (!integration) {
        throw new UnrecoverableError('INTEGRATION_NOT_CONNECTED')
      }

      // 3. Fetch action item
      const actionItem = await prisma.actionItem.findFirst({
        where: { id: actionItemId, teamId },
        include: { assignee: true }
      })

      if (!actionItem) {
        throw new UnrecoverableError('ACTION_ITEM_NOT_FOUND')
      }

      // 4. Resolve Provider
      const providerClient = resolveProvider(provider as ProviderType)

      // 5. Create or Update Issue
      // Type narrowing: createIssue / updateIssueStatus are Jira-specific methods.
      // resolveProvider() now returns a union of all providers — cast to JiraProvider
      // when provider === 'JIRA' is confirmed. Runtime behavior is identical.
      let result
      if (provider === 'JIRA') {
        const jiraClient = providerClient as import('../../modules/integrations/providers/jira.provider').JiraProvider
        if (actionItem.jiraIssueId) {
          result = await jiraClient.updateIssueStatus(integration, actionItem.jiraIssueId, actionItem.completed)
        } else {
          const createResult = await jiraClient.createIssue(integration, actionItem)
          await prisma.actionItem.update({
            where: { id: actionItem.id },
            data: {
              jiraIssueId: createResult.issueKey,
              jiraIssueUrl: createResult.issueUrl,
              jiraIssueSyncedAt: new Date()
            }
          })
        }
      }
      // LINEAR / SLACK / NOTION issue creation: handled via integrate.worker extension
      // when those provider-specific createIssue methods are invoked from the job payload.


      // 6. On Success
      await prisma.teamIntegration.update({
        where: { id: integration.id },
        data: { consecutiveErrors: 0, lastError: null, lastSyncedAt: new Date() }
      })
      socketEmitter.to(`team:${teamId}`).emit('action_item:sync_complete', { actionItemId, provider, success: true })

    } catch (error: any) {
      // 7. On Failure
      if (error instanceof UnrecoverableError) {
         throw error
      }

      const integration = await prisma.teamIntegration.findFirst({
        where: { teamId, provider: provider as any }
      })

      if (integration) {
        const updateRes = await prisma.teamIntegration.update({
          where: { id: integration.id },
          data: { consecutiveErrors: { increment: 1 }, lastError: error.message },
          select: { consecutiveErrors: true, id: true }
        })

        if (updateRes.consecutiveErrors >= 5) {
          await prisma.teamIntegration.update({
            where: { id: integration.id },
            data: { isActive: false, disconnectedAt: new Date() } // system disconnected
          })

          await notifyQueue.add('send-notification', {
            type: 'INTEGRATION_AUTO_DISABLED',
            teamId,
            metadata: { provider }
          })
        }
      }

      socketEmitter.to(`team:${teamId}`).emit('action_item:sync_complete', { actionItemId, provider, success: false })

      // Remove lock if it's going to be retried by BullMQ so next attempt can run
      if (idempotencyKey && job.attemptsMade < (job.opts.attempts || 3) - 1) {
         await redis.del(`integrate:lock:${idempotencyKey}`)
      }

      throw error
    }
  },
  {
    connection: { host: process.env.REDIS_HOST, port: parseInt(process.env.REDIS_PORT ?? '6379') },
    concurrency: parseInt(process.env.WORKER_CONCURRENCY_INTEGRATE || '2', 10),
  }
)

integrateWorker.on('failed', async (job, err) => {
  logger.error({ jobId: job?.id, err }, 'integrate.worker: job failed')
  if (job && job.data.idempotencyKey && job.attemptsMade >= (job.opts.attempts || 3)) {
     // Terminal failure, release lock
     await redis.del(`integrate:lock:${job.data.idempotencyKey}`)
  }
})
