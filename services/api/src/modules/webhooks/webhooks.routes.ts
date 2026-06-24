import { Router } from 'express'
import express from 'express'
import { handleRecallWebhook } from './recall.webhook'
import { handleStripeWebhook } from './stripe.webhook'
import { handleJiraWebhook } from './jira.webhook'
import { handleSlackWebhook } from './slack.webhook'

const router = Router()

// Capture raw body for webhook signature verification (all routes need this)
const rawBodyMiddleware = express.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf
  }
})

// Slack sends interactive payloads as application/x-www-form-urlencoded
// with a `payload` JSON field — NOT a raw JSON body like every other webhook.
// This parsing difference is isolated entirely in this router registration.
const rawUrlencodedMiddleware = express.urlencoded({
  extended: false,
  verify: (req: any, res, buf) => {
    req.rawBody = buf
  }
})

router.post('/recall',  rawBodyMiddleware,        handleRecallWebhook)
router.post('/stripe',  rawBodyMiddleware,        handleStripeWebhook)
router.post('/jira',    rawBodyMiddleware,        handleJiraWebhook)
// Slack interactive webhooks use x-www-form-urlencoded (see slack.webhook.ts comment)
router.post('/slack',   rawUrlencodedMiddleware,  handleSlackWebhook)

export const webhookRoutes = router
