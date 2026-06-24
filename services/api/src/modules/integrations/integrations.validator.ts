import { z } from 'zod'

export const providerParamSchema = {
    params: z.object({
        provider: z.enum(['JIRA', 'LINEAR', 'SLACK', 'NOTION'], {
            message: 'INVALID_PROVIDER'
        })
    })
}

export const callbackQuerySchema = {
    query: z.object({
        code: z.string().min(1, 'Code is required').optional(),
        state: z.string().length(64, 'State must be exactly 64 characters'),
        error: z.string().optional()
    }),
    params: z.object({
        provider: z.enum(['JIRA', 'LINEAR', 'SLACK', 'NOTION'], {
            message: 'INVALID_PROVIDER'
        })
    })
}
