import type { NextFunction, Request, Response } from 'express'
import {
    ZodError,
    ZodObject,
    ZodRawShape,
} from 'zod'

import { ValidationError } from '../utils/errors'

type RequestSchema = {
    body?: ZodObject<ZodRawShape>
    query?: ZodObject<ZodRawShape>
    params?: ZodObject<ZodRawShape>
}

function buildFieldErrors(error: ZodError): Record<string, string> {
    const fields: Record<string, string> = {}

    for (const issue of error.issues) {
        const key = issue.path.join('.')

        if (!fields[key]) {
            fields[key] = issue.message
        }
    }

    return fields
}

export function validate(schema: RequestSchema) {
    return async (
        req: Request,
        _res: Response,
        next: NextFunction,
    ) => {
        try {
            /* ----------------------------- Body ----------------------------- */

            if (schema.body) {
                const result = schema.body.safeParse(req.body)

                if (!result.success) {
                    throw new ValidationError(
                        buildFieldErrors(result.error),
                    )
                }

                req.body = result.data
            }

            /* ----------------------------- Query ---------------------------- */

            if (schema.query) {
                const result = schema.query.safeParse(req.query)

                if (!result.success) {
                    throw new ValidationError(
                        buildFieldErrors(result.error),
                    )
                }

                Object.assign(req.query, result.data)
            }

            /* ----------------------------- Params --------------------------- */

            if (schema.params) {
                const result = schema.params.safeParse(req.params)

                if (!result.success) {
                    throw new ValidationError(
                        buildFieldErrors(result.error),
                    )
                }

                Object.assign(req.params, result.data)
            }

            next()
        } catch (error) {
            next(error)
        }
    }
}