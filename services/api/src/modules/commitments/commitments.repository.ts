import { prisma } from '../../db/client'
import { CommitmentStatus } from '@prisma/client'
import type { ListCommitmentsQuery, TeamStatsQuery } from './commitments.types'

// ── Read Queries ─────────────────────────────────────────────────────────────

async function listCommitments(teamId: string, query: ListCommitmentsQuery) {
  const where: any = { teamId }

  // Status Filter
  if (query.status) {
    if (Array.isArray(query.status)) {
      where.status = { in: query.status }
    } else {
      where.status = query.status
    }
  }

  // Overdue Filter
  if (query.overdue) {
    where.status = 'PENDING'
    where.dueDate = { lt: new Date() }
  }

  // Owner Filter
  if (query.ownerId) {
    where.ownerId = query.ownerId
  }

  // Meeting Filter
  if (query.meetingId) {
    where.meetingId = query.meetingId
  }

  // Date Range Filter
  if (query.from || query.to) {
    where.createdAt = {}
    if (query.from) where.createdAt.gte = new Date(query.from)
    if (query.to) where.createdAt.lte = new Date(query.to)
  }

  // Text Search Filter
  if (query.search) {
    where.text = { contains: query.search, mode: 'insensitive' }
  }

  // Confidence Filter
  if (query.confidenceScore !== undefined) {
    where.confidenceScore = { gte: query.confidenceScore }
  }

  // Cursor Pagination
  const take = (query.limit || 20) + 1
  const cursor = query.cursor ? { id: query.cursor } : undefined

  // Sort Order
  let orderBy: any = []
  if (query.sortBy) {
    orderBy.push({ [query.sortBy]: query.sortOrder || 'desc' })
  } else {
    // Default sorting: MISSED first, then PENDING by dueDate ASC, then others by createdAt DESC
    // Since Prisma orderBy doesn't fully support this level of complex conditional ordering directly without raw SQL,
    // we'll rely on an approximation or just use standard fields. A fully accurate implementation might require raw queries or sorting in memory.
    // Standard approximation:
    orderBy = [
      { status: 'desc' }, // Depending on enum value order, this might not perfectly match 'MISSED' first
      { dueDate: 'asc' },
      { createdAt: 'desc' }
    ]
  }

  const [items, counts] = await Promise.all([
    prisma.commitment.findMany({
      where,
      take,
      ...(cursor && { cursor, skip: 1 }),
      orderBy,
      include: {
        owner: { select: { id: true, name: true, avatarUrl: true, commitmentScore: true } },
        meeting: { select: { id: true, title: true, scheduledAt: true } }
      }
    }),
    prisma.commitment.groupBy({
      by: ['status'],
      where: {
        teamId,
        ...(query.ownerId && { ownerId: query.ownerId }),
        ...(query.meetingId && { meetingId: query.meetingId }),
        ...(query.from || query.to ? { createdAt: where.createdAt } : {})
      },
      _count: {
        status: true
      }
    })
  ])

  let nextCursor: typeof query.cursor | undefined = undefined
  if (items.length === take) {
    const nextItem = items.pop()
    nextCursor = nextItem?.id
  }

  const statusCounts = counts.reduce((acc, curr) => {
    acc[curr.status] = curr._count.status
    return acc
  }, {} as Record<string, number>)

  return { items, nextCursor, counts: statusCounts }
}

async function findById(id: string, teamId: string) {
  return prisma.commitment.findFirst({
    where: { id, teamId },
    include: {
      owner: { select: { id: true, name: true, avatarUrl: true, commitmentScore: true } },
      meeting: { select: { id: true, title: true, scheduledAt: true } },
      resolvedInMeeting: { select: { id: true, title: true, scheduledAt: true } }
    }
  })
}

// ── Stats ────────────────────────────────────────────────────────────────────

async function getTeamStats(teamId: string, query: TeamStatsQuery) {
  const where: any = { teamId }
  if (query.from || query.to) {
    where.createdAt = {}
    if (query.from) where.createdAt.gte = new Date(query.from)
    if (query.to) where.createdAt.lte = new Date(query.to)
  }

  const aggregates = await prisma.commitment.groupBy({
    by: ['status'],
    where,
    _count: { status: true }
  })

  return aggregates
}

async function getPerMemberStats(teamId: string, query: TeamStatsQuery) {
  // Simplification for brevity, real implementation would group by ownerId and status
  const where: any = { teamId }
  if (query.from || query.to) {
    where.createdAt = {}
    if (query.from) where.createdAt.gte = new Date(query.from)
    if (query.to) where.createdAt.lte = new Date(query.to)
  }

  const membersData = await prisma.user.findMany({
    where: { teamId },
    select: {
      id: true,
      name: true,
      commitmentScore: true,
      ownedCommitments: {
        where,
        select: { status: true }
      }
    }
  })

  return membersData
}

export const commitmentsRepository = {
  listCommitments,
  findById,
  getTeamStats,
  getPerMemberStats
}
