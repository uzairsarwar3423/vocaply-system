import { z } from 'zod'

export const listCommitmentsSchema = z.object({
  status: z.union([z.string(), z.array(z.string())]).optional(),
  ownerId: z.string().cuid().optional(),
  meetingId: z.string().cuid().optional(),
  overdue: z.enum(['true', 'false', '1', '0']).optional().transform(val => val === 'true' || val === '1'),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  search: z.string().max(200).optional(),
  confidenceScore: z.string().optional().transform(val => val ? parseFloat(val) : undefined),
  limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 20),
  cursor: z.string().optional(),
  sortBy: z.enum(['dueDate', 'createdAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional()
})

export const updateCommitmentStatusSchema = z.object({
  status: z.enum(['FULFILLED', 'DEFERRED', 'CANCELLED']),
  note: z.string().max(1000).optional(),
  newDueDate: z.string().datetime().optional()
}).refine(data => {
  if (data.status === 'DEFERRED' && !data.newDueDate) return false
  if (data.status === 'CANCELLED' && !data.note) return false
  return true
}, {
  message: "newDueDate is required for DEFERRED, note is required for CANCELLED"
})

export const teamStatsSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional()
})
