import { prisma } from '../../db/client'
import { PriorityLevel } from '@prisma/client'
import type { ListActionItemsQuery } from './action-items.types'

async function listActionItems(teamId: string, query: ListActionItemsQuery) {
  const where: any = { teamId }

  // Assignee Filter
  if (query.assigneeId) {
    where.assigneeId = query.assigneeId
  }

  // Completed Filter
  if (query.completed !== undefined) {
    where.completed = query.completed
  }

  // Priority Filter (single or array)
  if (query.priority) {
    if (Array.isArray(query.priority)) {
      where.priority = { in: query.priority }
    } else {
      where.priority = query.priority
    }
  }

  // Meeting Filter
  if (query.meetingId) {
    where.meetingId = query.meetingId
  }

  // Has Jira Ticket Filter
  if (query.hasJiraTicket !== undefined) {
    where.jiraIssueId = query.hasJiraTicket ? { not: null } : null
  }

  // Has Linear Issue Filter
  if (query.hasLinearIssue !== undefined) {
    where.linearIssueId = query.hasLinearIssue ? { not: null } : null
  }

  // Date Range Filter on createdAt
  if (query.from || query.to) {
    where.createdAt = {}
    if (query.from) where.createdAt.gte = new Date(query.from)
    if (query.to) where.createdAt.lte = new Date(query.to)
  }

  // Text Search Filter (insensitive ILIKE)
  if (query.search) {
    where.text = { contains: query.search, mode: 'insensitive' }
  }

  // Keyset Cursor Pagination
  const limit = query.limit ?? 20
  const take = limit + 1
  const cursor = query.cursor ? { id: query.cursor } : undefined

  // Sort Order Configuration
  const orderBy: any[] = []
  if (query.sortBy) {
    const sortField = query.sortBy
    const sortOrder = query.sortOrder || 'desc'
    orderBy.push({ [sortField]: sortOrder })
  } else {
    // Default sorting: incomplete-first, then newest first
    orderBy.push({ completed: 'asc' })
    orderBy.push({ createdAt: 'desc' })
  }
  // Guarantee stable order with ID as tiebreaker
  orderBy.push({ id: 'desc' })

  const [items, counts] = await Promise.all([
    prisma.actionItem.findMany({
      where,
      take,
      ...(cursor && { cursor, skip: 1 }),
      orderBy,
      include: {
        assignee: { select: { id: true, name: true, avatarUrl: true } },
        meeting: { select: { id: true, title: true, scheduledAt: true } }
      }
    }),
    prisma.actionItem.groupBy({
      by: ['completed'],
      where: {
        teamId,
        ...(query.assigneeId && { assigneeId: query.assigneeId }),
        ...(query.meetingId && { meetingId: query.meetingId }),
        ...(query.from || query.to ? { createdAt: where.createdAt } : {})
      },
      _count: {
        completed: true
      }
    })
  ])

  let nextCursor: string | undefined = undefined
  if (items.length === take) {
    const nextItem = items.pop()
    nextCursor = nextItem?.id
  }

  // Shape summary counts
  const summaryCounts = counts.reduce((acc, curr) => {
    const key = curr.completed ? 'completed' : 'incomplete'
    acc[key] = curr._count.completed
    return acc
  }, { completed: 0, incomplete: 0 } as Record<string, number>)

  return { items, nextCursor, counts: summaryCounts }
}

async function findById(id: string, teamId: string) {
  return prisma.actionItem.findFirst({
    where: { id, teamId },
    include: {
      assignee: { select: { id: true, name: true, avatarUrl: true } },
      meeting: { select: { id: true, title: true, scheduledAt: true } },
      completedBy: { select: { id: true, name: true } }
    }
  })
}

async function update(id: string, teamId: string, data: any) {
  return prisma.actionItem.update({
    where: { id, teamId },
    data,
    include: {
      assignee: { select: { id: true, name: true, avatarUrl: true } },
      meeting: { select: { id: true, title: true, scheduledAt: true } },
      completedBy: { select: { id: true, name: true } }
    }
  })
}

export const actionItemsRepository = {
  listActionItems,
  findById,
  update
}
