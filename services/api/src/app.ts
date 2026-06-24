import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'

import { env } from './config/env'
import { requestLogger } from './middleware/request-logger.middleware'
import { ipRateLimiter } from './middleware/rate-limit.middleware'
import { errorMiddleware } from './middleware/error.middleware'
import { NotFoundError } from './utils/errors'
import { authRouter } from './modules/auth/auth.routes'
import { teamsRouter } from './modules/teams/teams.routes'
import { meetingsRouter } from './modules/meetings/meetings.routes'
import { commitmentsRouter } from './modules/commitments/commitments.routes'
import { actionItemsRouter } from './modules/action-items/action-items.routes'
import { integrationsRouter } from './modules/integrations/integrations.routes'
import { webhookRoutes } from './modules/webhooks/webhooks.routes'
import { notificationsRouter } from './modules/notifications/notifications.routes'
import { analyticsRouter } from './modules/analytics/analytics.routes'
import { setupBullBoard } from './config/bull-board'

const app = express()

// ----------------------
// Security & Utility Middleware
// ----------------------
app.use(
    cors({
        origin: env.APP_URL,
        credentials: true,
    })
)
app.use(helmet())
app.use(express.json({ 
    limit: '10mb',
    verify: (req: any, res, buf) => {
        req.rawBody = buf
    }
}))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use(cookieParser())

// ----------------------
// Custom Request Logging & Rate Limiting
// ----------------------
app.use(requestLogger())
app.use(ipRateLimiter)

// ── X-Request-ID — required by Day 17 checklist ──────────────────────────────
app.use((_req, res, next) => {
    const reqId = crypto.randomUUID()
    res.setHeader('X-Request-ID', reqId)
    next()
})

// ----------------------
// Health Check Route
// ----------------------
app.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Vocaply API is running 🚀',
        timestamp: new Date().toISOString(),
    })
})

// ── /ready — checks Redis + MongoDB (Day 18 requirement) ─────────────────────
app.get('/ready', async (req, res) => {
    const checks: Record<string, string> = {}
    let healthy = true

    try {
        const { redis } = await import('./config/redis')
        await redis.ping()
        checks.redis = 'ok'
    } catch {
        checks.redis = 'error'
        healthy = false
    }

    try {
        const { getMongoDB } = await import('./db/mongo.client')
        const db = getMongoDB()
        if (db) {
            await db.command({ ping: 1 })
            checks.mongodb = 'ok'
        } else {
            checks.mongodb = 'not_connected'
        }
    } catch {
        checks.mongodb = 'error'
    }

    res.status(healthy ? 200 : 503).json({
        status: healthy ? 'ready' : 'not_ready',
        checks,
        timestamp: new Date().toISOString(),
    })
})

// ----------------------
// API Routes
// ----------------------
// Google Console redirects directly to /auth/google/callback, so we redirect it to our versioned API endpoint
app.get('/auth/google/callback', (req, res) => {
    const query = req.url.split('?')[1]
    res.redirect(`/api/v1/auth/google/callback${query ? '?' + query : ''}`)
})

app.use('/api/v1/auth', authRouter)
app.use('/api/v1/teams', teamsRouter)
app.use('/api/v1/meetings', meetingsRouter)
app.use('/api/v1/commitments', commitmentsRouter)
app.use('/api/v1/action-items', actionItemsRouter)
app.use('/api/v1/integrations', integrationsRouter)
app.use('/api/v1/notifications', notificationsRouter)
app.use('/api/v1/analytics', analyticsRouter)
app.use('/api/webhooks', webhookRoutes)

// ── BullBoard (job monitoring — non-prod only) ────────────────────────────────
// Must be mounted BEFORE the 404 catch-all so /admin/queues is matched
setupBullBoard(app)

// ----------------------
// Catch-All / 404 Route
// ----------------------
app.use((req, res, next) => {
    next(new NotFoundError(`Route ${req.method} ${req.path}`))
})

// ----------------------
// Global Error Handler (MUST BE LAST)
// ----------------------
app.use(errorMiddleware)

export default app