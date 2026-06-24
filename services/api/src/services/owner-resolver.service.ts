import { prisma } from '../db/client'
import levenshtein from 'js-levenshtein'
import { logger } from '../config/logger'

/**
 * Resolves a speaker name/email from the AI extraction to a concrete Vocaply userId
 * using exact email matching or fuzzy name matching (Levenshtein distance).
 */
export async function resolveOwner(
  teamId: string,
  speakerName: string,
  speakerEmail?: string
): Promise<{ userId: string; confidence: number } | null> {
  // 1. Exact match by email (Highest Confidence)
  if (speakerEmail) {
    const userByEmail = await prisma.user.findFirst({
      where: { teamId, email: speakerEmail.toLowerCase(), deletedAt: null },
      select: { id: true }
    })
    
    if (userByEmail) {
      return { userId: userByEmail.id, confidence: 1.0 }
    }
  }

  // 2. Exact or Fuzzy match by name
  const teamMembers = await prisma.user.findMany({
    where: { teamId, deletedAt: null },
    select: { id: true, name: true }
  })

  let bestMatch = null
  let bestScore = Infinity // Lower is better (Levenshtein distance)

  for (const member of teamMembers) {
    // If exact name match
    if (member.name.toLowerCase() === speakerName.toLowerCase()) {
      return { userId: member.id, confidence: 0.95 }
    }

    const dist = levenshtein(member.name.toLowerCase(), speakerName.toLowerCase())
    if (dist < bestScore) {
      bestScore = dist
      bestMatch = member
    }
  }

  // Acceptable threshold for typos (e.g. "Sara" vs "Sarah")
  // Maximum allowed distance is 2
  if (bestMatch && bestScore <= 2) {
    // Confidence decays with distance: 0 dist = 0.95, 1 dist = 0.85, 2 dist = 0.75
    const confidence = 0.95 - (bestScore * 0.1)
    
    if (confidence >= 0.8) {
      return { userId: bestMatch.id, confidence }
    }
  }

  logger.warn({ teamId, speakerName, speakerEmail }, 'Failed to resolve speaker to an existing user identity')
  return null
}
