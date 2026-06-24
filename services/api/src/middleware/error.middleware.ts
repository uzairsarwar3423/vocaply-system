import { Request, Response, NextFunction } from 'express'
import { Prisma } from '@prisma/client'
import { ZodError } from 'zod'

import { AppError } from '../utils/errors'
import { logger } from '../config/logger'

/**
 * Global Error Handler
 * Must be registered LAST in app.ts
 */
export function errorMiddleware(
    err: unknown,
    req: Request,
    res: Response,
    _next: NextFunction
) {
    const requestId = (req.headers['x-request-id'] as string) || 'unknown'

    // Default values (safe fallback)
    let statusCode = 500
    let code = 'INTERNAL_ERROR'
    let message = 'Something went wrong'
    let details: Record<string, unknown> | undefined = undefined

    /**
     * 1. Handle custom AppError hierarchy
     */
    if (err instanceof AppError) {
        statusCode = err.statusCode
        code = err.code
        message = err.message
        details = err.details
    }

    /**
     * 2. Handle Prisma Known Errors
     */
    else if (err instanceof Prisma.PrismaClientKnownRequestError) {
        switch (err.code) {
            case 'P2002':
                statusCode = 409
                code = 'DUPLICATE'
                message = 'Resource already exists'
                details = { meta: err.meta }
                break

            case 'P2025':
                statusCode = 404
                code = 'NOT_FOUND'
                message = 'Resource not found'
                details = { meta: err.meta }
                break

            default:
                statusCode = 500
                code = 'DATABASE_ERROR'
                message = 'Database operation failed'
                details = { prismaCode: err.code }
        }
    }

    /**
     * 3. Handle Prisma Validation / Unknown DB errors
     */
    else if (err instanceof Prisma.PrismaClientValidationError) {
        statusCode = 400
        code = 'DATABASE_VALIDATION_ERROR'
        message = 'Invalid database query'
    }

    /**
     * 4. Handle Zod validation errors (safety net)
     */
    else if (err instanceof ZodError) {
        statusCode = 422
        code = 'VALIDATION_ERROR'

        const fields: Record<string, string> = {}

        err.issues.forEach((e) => {
            fields[e.path.join('.')] = e.message
        })

        message = 'Validation failed'
        details = { fields }
    }

    /**
     * 5. Handle native JS errors
     */
    else if (err instanceof Error) {
        message = err.message
    }

    /**
     * 6. Unknown error fallback
     */
    else {
        message = 'Unknown server error'
    }

    /**
     * Production safety: never leak internal stack traces
     */
    const isProduction = process.env.NODE_ENV === 'production'

    if (!isProduction) {
        logger.error({
            requestId,
            path: req.path,
            method: req.method,
            error: err,
        })
    } else {
        logger.error({
            requestId,
            path: req.path,
            method: req.method,
            code,
            message,
        })
    }

    /**
     * Final response
     */
    return res.status(statusCode).json({
        success: false,
        requestId,
        error: {
            code,
            message,
            ...(details && { details }),
        },
    })
}