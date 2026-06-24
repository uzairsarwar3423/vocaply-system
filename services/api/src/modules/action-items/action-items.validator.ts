import { z } from 'zod'
import { PriorityLevel } from '@prisma/client'

export const listActionItemsSchema = z.object({
  assigneeId: z.string().cuid().optional(),
  completed: z.enum(['true', 'false']).optional().transform(val => val === 'true'),
  priority: z.preprocess((val) => {
    if (typeof val === 'string') {
      return val.split(',')
    }
    return val
  }, z.array(z.nativeEnum(PriorityLevel))).optional(),
  meetingId: z.string().cuid().optional(),
  hasJiraTicket: z.enum(['true', 'false']).optional().transform(val => val === 'true'),
  hasLinearIssue: z.enum(['true', 'false']).optional().transform(val => val === 'true'),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  search: z.string().min(2).max(200).optional(),
  cursor: z.string().optional(),
  limit: z.string().optional().transform(val => val ? Math.min(parseInt(val, 10), 100) : 20),
  sortBy: z.enum(['createdAt', 'dueDate', 'priority']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional()
})

export const updateActionItemSchema = z.object({
  completed: z.boolean().optional(),
  assigneeId: z.string().cuid().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  priority: z.nativeEnum(PriorityLevel).optional(),
  text: z.string().min(1).max(500).optional()
})

export const syncActionItemSchema = z.object({
  provider: z.enum(['JIRA', 'LINEAR', 'NOTION'])
})
