// services/api/src/middleware/request-logger.middleware.ts

import { NextFunction, Request, Response } from 'express'
import crypto from 'node:crypto'
import { logger } from '../config/logger'

export function requestLogger() {
    return (
        req: Request,
        res: Response,
        next: NextFunction
    ) => {
        const start = process.hrtime.bigint()

        const requestId =
            req.headers['x-request-id'] ??
            crypto.randomUUID()

        req.headers['x-request-id'] = requestId

        res.setHeader(
            'x-request-id',
            String(requestId)
        )

        res.on('finish', () => {
            const end = process.hrtime.bigint()

            const latencyMs =
                Number(end - start) / 1_000_000

            logger.info({
                requestId,

                method: req.method,

                path: req.originalUrl,

                statusCode: res.statusCode,

                latencyMs: Number(
                    latencyMs.toFixed(2)
                ),

                ip:
                    req.headers['x-forwarded-for'] ||
                    req.socket.remoteAddress,

                userAgent: req.headers['user-agent'],

                userId: (req as any).user?.id ?? null,

                teamId: (req as any).team?.id ?? null,
            })
        })

        next()
    }
}