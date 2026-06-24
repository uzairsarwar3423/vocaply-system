import { prisma } from '../../db/client'
import { commitmentsRepository } from './commitments.repository'
import { calculateCommitmentScore } from '../../services/score.service'
import { notifyQueue, integrateQueue } from '../../queues/queue.client'
import type { ListCommitmentsQuery, UpdateCommitmentStatusDto, TeamStatsQuery } from './commitments.types'
import { getIO } from '../../realtime/socket.server'
import { SERVER_EVENTS } from '../../realtime/socket.events'
import { teamRoom, userRoom } from '../../realtime/rooms.manager'

export async function listCommitments(teamId: string, query: ListCommitmentsQuery) {
  return commitmentsRepository.listCommitments(teamId, query)
}

export async function getMyCommitments(userId: string, teamId: string, query: Omit<ListCommitmentsQuery, 'ownerId'>) {
  const result = await commitmentsRepository.listCommitments(teamId, { ...query, ownerId: userId })
  
  // Calculate personal summary
  const summary = {
    pending: result.counts['PENDING'] || 0,
    overdue: 0, // This is an approximation. Real overdue needs a specific count or is derived if `overdue: true` was passed.
    fulfilled: result.counts['FULFILLED'] || 0,
    missed: result.counts['MISSED'] || 0
  }

  // Calculate actual overdue if needed
  const overdueCount = await prisma.commitment.count({
    where: { teamId, ownerId: userId, status: 'PENDING', dueDate: { lt: new Date() } }
  })
  summary.overdue = overdueCount

  return { ...result, summary }
}

export async function getCommitmentStats(teamId: string, query: TeamStatsQuery) {
  const aggregates = await commitmentsRepository.getTeamStats(teamId, query)
  
  let total = 0
  let fulfilled = 0
  let missed = 0
  let pending = 0
  let deferred = 0

  aggregates.forEach(agg => {
    total += agg._count.status
    if (agg.status === 'FULFILLED') fulfilled += agg._count.status
    if (agg.status === 'MISSED') missed += agg._count.status
    if (agg.status === 'PENDING') pending += agg._count.status
    if (agg.status === 'DEFERRED') deferred += agg._count.status
  })

  const decided = fulfilled + missed
  const fulfillmentRate = decided === 0 ? 100 : Math.round((fulfilled / decided) * 100)
  
  const teamSummary = { total, fulfilled, missed, pending, deferred, fulfillmentRate, avgDaysOverdue: 0 } // avgDaysOverdue omitted for brevity

  const membersData = await commitmentsRepository.getPerMemberStats(teamId, query)
  const byMember = membersData.map(m => {
    let mTotal = 0, mFulfilled = 0, mMissed = 0
    m.ownedCommitments.forEach(c => {
      mTotal++
      if (c.status === 'FULFILLED') mFulfilled++
      if (c.status === 'MISSED') mMissed++
    })
    const mDecided = mFulfilled + mMissed
    const mFulfillmentRate = mDecided === 0 ? 100 : Math.round((mFulfilled / mDecided) * 100)
    return {
      userId: m.id,
      name: m.name,
      fulfillmentRate: mFulfillmentRate,
      score: m.commitmentScore,
      trend: 'stable' // Can be hydrated correctly
    }
  }).sort((a, b) => b.fulfillmentRate - a.fulfillmentRate)

  // Dummy trend for now since we haven't built the snapshot aggregation fully
  const trend = [
    { week: "current", fulfillmentRate: 100, label: "This Week" }
  ]

  return { period: query, team: teamSummary, byMember, trend }
}

export async function getCommitmentDetail(id: string, teamId: string) {
  const commitment = await commitmentsRepository.findById(id, teamId)
  if (!commitment) return null
  return commitment
}

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['FULFILLED', 'DEFERRED', 'CANCELLED'],
  DEFERRED: ['FULFILLED', 'CANCELLED']
}

export async function updateCommitmentStatus(
  id: string,
  teamId: string,
  userId: string,
  role: string,
  data: UpdateCommitmentStatusDto
) {
  const commitment = await commitmentsRepository.findById(id, teamId)
  
  if (!commitment) throw new Error('NOT_FOUND')

  if (role === 'MEMBER' && commitment.ownerId !== userId) {
    throw new Error('FORBIDDEN')
  }

  if (!ALLOWED_TRANSITIONS[commitment.status]?.includes(data.status)) {
    throw new Error('INVALID_TRANSITION')
  }

  if (data.status === 'DEFERRED' && !data.newDueDate) throw new Error('VALIDATION_ERROR')
  if (data.status === 'CANCELLED' && !data.note) throw new Error('VALIDATION_ERROR')

  // Transaction
  const updatedCommitment = await prisma.$transaction(async (tx) => {
    const updateData: any = {
      status: data.status,
      resolvedAt: data.status === 'FULFILLED' ? new Date() : undefined,
      manualStatusById: userId
    }

    if (data.status === 'DEFERRED') {
      updateData.deferredCount = { increment: 1 }
      updateData.dueDate = new Date(data.newDueDate!)
      updateData.deferredNote = data.note
      if (commitment.deferredCount === 0) {
        updateData.originalDueDate = commitment.dueDate
      }
    } else if (data.status === 'CANCELLED') {
      updateData.cancellationNote = data.note
    }

    return tx.commitment.update({
      where: { id },
      data: updateData
    })
  })

  // Recalculate score
  const newScore = await calculateCommitmentScore(commitment.ownerId, teamId)
  await prisma.user.update({
    where: { id: commitment.ownerId },
    data: { commitmentScore: newScore.score }
  })

  // Events — wrapped in try/catch so a Socket.io-layer failure
  // NEVER propagates to the DB write caller (realtime is a nice-to-have
  // layered ON TOP of the source-of-truth write, never a dependency of it)
  try {
    const io = getIO()
    if (data.status === 'FULFILLED') {
      io.to(teamRoom(teamId)).emit(SERVER_EVENTS.COMMITMENT_FULFILLED, { commitmentId: id })
    } else if (data.status === 'DEFERRED') {
      io.to(teamRoom(teamId)).emit(SERVER_EVENTS.COMMITMENT_DEFERRED, { commitmentId: id })
    }
    if (commitment.owner.commitmentScore !== newScore.score) {
      io.to(userRoom(commitment.ownerId)).emit(SERVER_EVENTS.MY_SCORE_UPDATED, { newScore: newScore.score })
    }
  } catch (err) {
    // Non-fatal: Socket.io failure must not affect the committed DB transaction
    const { logger } = await import('../../config/logger')
    logger.warn({ err }, 'commitments.service: Socket.io emit failed (non-fatal)')
  }

  if (data.status === 'FULFILLED') {
    // If we had a logic to check for Jira link, we'd add it to integrate queue here
    // Example:
    await integrateQueue.add('jira-sync', { type: 'COMMITMENT_FULFILLED', commitmentId: id, teamId })
  }

  return updatedCommitment
}

export const commitmentsService = {
  listCommitments,
  getMyCommitments,
  getCommitmentStats,
  getCommitmentDetail,
  updateCommitmentStatus
}
