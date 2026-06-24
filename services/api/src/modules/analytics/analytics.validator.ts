import { z } from 'zod'

// ── Shared Date Range Schema ───────────────────────────────────────────────────

export const dateRangeQuerySchema = z
  .object({
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
  })
  .refine(
    (data) => {
      if (data.from && data.to) {
        return new Date(data.from) <= new Date(data.to)
      }
      return true
    },
    { message: 'from must be less than or equal to to', path: ['from'] }
  )

export type DateRangeQuery = z.infer<typeof dateRangeQuerySchema>

// ── Trends-specific Schema (extends date range) ───────────────────────────────

export const trendsQuerySchema = z
  .object({
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    metric: z.enum(['fulfillmentRate', 'meetingsCount']),
    granularity: z.enum(['week', 'month']).default('week'),
  })
  .refine(
    (data) => {
      if (data.from && data.to) {
        return new Date(data.from) <= new Date(data.to)
      }
      return true
    },
    { message: 'from must be less than or equal to to', path: ['from'] }
  )

export type TrendsQuery = z.infer<typeof trendsQuerySchema>
