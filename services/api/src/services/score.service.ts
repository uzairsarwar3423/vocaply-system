import { prisma } from '../db/client'
import { subDays } from 'date-fns'

export async function calculateCommitmentScore(
  userId: string,
  teamId: string
): Promise<{
  score: number
  fulfillmentRate: number
  onTimeRate: number
  trend: 'improving' | 'stable' | 'declining'
}> {
  const since = subDays(new Date(), 30)

  const commitments = await prisma.commitment.findMany({
    where: {
      ownerId: userId,
      teamId,
      createdAt: { gte: since },
      status: { in: ['FULFILLED', 'MISSED', 'PENDING'] },
      confidenceScore: { gte: 0.5 },
    },
  })

  if (commitments.length === 0) return { score: 0, fulfillmentRate: 0, onTimeRate: 0, trend: 'stable' }

  const fulfilled = commitments.filter((c) => c.status === 'FULFILLED').length
  const missed = commitments.filter((c) => c.status === 'MISSED').length
  const decided = fulfilled + missed

  // Base fulfillment rate (excludes pending)
  const baseFulfillmentRate = decided === 0 ? 100 : Math.round((fulfilled / decided) * 100)

  // Recency weighting: last 7 days = full weight, older = 70%
  const recentCutoff = subDays(new Date(), 7)
  const recentFulfilled = commitments.filter((c) => c.status === 'FULFILLED' && c.createdAt >= recentCutoff).length
  const recentDecided = commitments.filter((c) => ['FULFILLED','MISSED'].includes(c.status) && c.createdAt >= recentCutoff).length
  const olderFulfilled = fulfilled - recentFulfilled
  const olderDecided = decided - recentDecided

  let weightedRate = 100
  if (decided > 0) {
    const rw = recentDecided > 0 ? (recentFulfilled / recentDecided) * 1.0 * recentDecided : 0
    const ow = olderDecided > 0 ? (olderFulfilled / olderDecided) * 0.7 * olderDecided : 0
    const tw = recentDecided * 1.0 + olderDecided * 0.7
    weightedRate = tw > 0 ? ((rw + ow) / tw) * 100 : 100
  }

  // On-time bonus: up to +10 points
  const onTimeFulfilled = commitments.filter(
    (c) => c.status === 'FULFILLED' && c.resolvedAt && c.dueDate && c.resolvedAt <= c.dueDate
  ).length
  const onTimeRate = fulfilled === 0 ? 100 : Math.round((onTimeFulfilled / fulfilled) * 100)
  const onTimeBonus = (onTimeRate / 100) * 10

  const score = Math.min(100, Math.max(0, Math.round(weightedRate + onTimeBonus)))

  // Trend
  const trend = await calculateScoreTrend(userId, teamId)

  return { score, fulfillmentRate: baseFulfillmentRate, onTimeRate, trend }
}

async function getWeekRate(userId: string, teamId: string, from: Date, to: Date): Promise<number> {
  const commitments = await prisma.commitment.findMany({
    where: {
      ownerId: userId,
      teamId,
      createdAt: { gte: from, lt: to },
      status: { in: ['FULFILLED', 'MISSED'] },
      confidenceScore: { gte: 0.5 },
    },
  })
  if (commitments.length === 0) return 100
  const fulfilled = commitments.filter(c => c.status === 'FULFILLED').length
  return Math.round((fulfilled / commitments.length) * 100)
}

async function calculateScoreTrend(userId: string, teamId: string): Promise<'improving' | 'stable' | 'declining'> {
  // Compare this week's rate vs last week's rate
  const thisWeekStart = subDays(new Date(), 7)
  const priorWeekStart = subDays(new Date(), 14)

  const thisWeek = await getWeekRate(userId, teamId, thisWeekStart, new Date())
  const priorWeek = await getWeekRate(userId, teamId, priorWeekStart, thisWeekStart)

  const diff = thisWeek - priorWeek
  if (diff > 5) return 'improving'
  if (diff < -5) return 'declining'
  return 'stable'
}
