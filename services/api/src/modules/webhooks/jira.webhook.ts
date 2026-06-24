import { Request, Response } from 'express'
import { verifyWebhookSignature } from './webhooks.validator'
import { redis } from '../../config/redis'
import { prisma } from '../../db/client'
import { getIO } from '../../realtime/socket.server'
import { SERVER_EVENTS } from '../../realtime/socket.events'
import { teamRoom } from '../../realtime/rooms.manager'
import { env } from '../../config/env'
import { logger } from '../../config/logger'

export const handleJiraWebhook = async (req: Request, res: Response) => {
    try {
        verifyWebhookSignature(req, env.JIRA_WEBHOOK_SECRET!, 'X-Hub-Signature', 'sha256=')
    } catch (e: any) {
        logger.warn({ error: e.message }, 'Jira webhook signature verification failed')
        return res.status(401).send('Invalid signature')
    }

    const payload = req.body
    if (!payload || !payload.issue || !payload.issue.key) {
        return res.status(200).send('Ignored: No issue key')
    }

    const issueKey = payload.issue.key
    const eventTimestamp = payload.timestamp || Date.now()
    const idempotencyKey = `webhook:processed:jira:${issueKey}:${eventTimestamp}`

    if (await redis.exists(idempotencyKey)) {
        logger.info({ issueKey }, 'Duplicate webhook delivery ignored')
        return res.status(200).send('OK')
    }

    res.status(200).send('OK')

    try {
        const actionItem = await prisma.actionItem.findFirst({
            where: { jiraIssueId: issueKey }
        })

        if (!actionItem) {
            logger.info({ issueKey }, 'Webhook for unknown/unlinked ticket')
            return
        }

        const teamId = actionItem.teamId
        const issueStatus = payload.issue.fields?.status?.name?.toLowerCase() || ''
        
        if (issueStatus.includes('done') && !actionItem.completed) {
            await prisma.actionItem.update({
                where: { id: actionItem.id },
                data: { completed: true, completedAt: new Date() }
            })
            
            try {
              getIO().to(teamRoom(teamId)).emit(SERVER_EVENTS.ACTION_ITEM_SYNCED, { actionItemId: actionItem.id, completed: true })
            } catch (err) {
              logger.warn({ err }, 'jira.webhook: Socket.io emit failed (non-fatal)')
            }
        }

        await redis.setex(idempotencyKey, 86400, '1')
    } catch (error) {
        logger.error({ error }, 'Failed to process Jira webhook')
    }
}
