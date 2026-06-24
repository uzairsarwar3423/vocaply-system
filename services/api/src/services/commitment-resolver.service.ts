import { prisma } from '../db/client'
import { logger } from '../config/logger'

const STOPWORDS = new Set([
  'i', 'will', 'have', 'the', 'a', 'an', 'by', 'to', 'it', 'my',
  'is', 'am', 'are', 'be', 'was', 'were', 'been', 'do', 'did',
  'does', 'for', 'with', 'this', 'that', 'all', 'in', 'on', 'at',
  'up', 'we', 'our', "i'll", "i'm", "let", "me", "make", "sure"
])

const COMPLETION_KEYWORDS = [
  'done', 'finished', 'completed', 'merged', 'deployed', 'shipped',
  'sent', 'delivered', 'fixed', 'resolved', 'pushed', 'released',
  'launched', 'submitted', 'closed', 'published', 'live', 'went live'
]

const NON_COMPLETION_PHRASES = [
  'still working', 'in progress', 'not done yet', 'almost', 'partially',
  'working on', 'in review', 'pending', 'blocked', 'waiting',
  'havent finished', "haven't finished", 'not finished', 'not completed'
]

const SIMILARITY_THRESHOLD = 0.65

export interface ExtractedCommitment {
  text: string
  owner_name: string
  due_date_raw: string | null
  confidence: number
}

/**
 * Normalizes text for similarity comparison (lowercase, strip punctuation, remove stopwords, limit tokens)
 */
export function normalizeText(text: string): string {
  let normalized = text.toLowerCase()
  normalized = normalized.replace(/[^\w\s]/g, '')
  
  let tokens = normalized.split(/\s+/)
  tokens = tokens.filter(t => !STOPWORDS.has(t))
  
  // Very simple stemming
  const stemmed = tokens.map(token => {
    if (token.endsWith('ing') && token.length > 5) return token.slice(0, -3)
    if (token.endsWith('ed') && token.length > 4) return token.slice(0, -2)
    if (token.endsWith('s') && token.length > 3) return token.slice(0, -1)
    return token
  })

  return stemmed.slice(0, 5).join(' ')
}

/**
 * Jaccard similarity fallback (Keyword overlap ratio)
 */
function keywordOverlapRatio(text1: string, text2: string): number {
  const tokens1 = new Set(normalizeText(text1).split(' '))
  const tokens2 = new Set(normalizeText(text2).split(' '))

  if (tokens1.size === 0 || tokens2.size === 0) return 0

  let intersectionSize = 0
  tokens1.forEach(t => {
    if (tokens2.has(t)) intersectionSize++
  })

  const unionSize = new Set([...tokens1, ...tokens2]).size
  return intersectionSize / unionSize
}

/**
 * Basic Similarity Score (In a pure Node env without sklearn, we rely heavily on keyword overlap. 
 * A more robust implementation would use a native TF-IDF library or an external microservice)
 */
export function calculateSimilarityScore(text1: string, text2: string): number {
  return keywordOverlapRatio(text1, text2)
}

/**
 * Main cross-meeting resolver. Maps new extraction results against historical open commitments.
 */
export async function resolveCommitments(
  teamId: string,
  meetingId: string,
  newExtractions: ExtractedCommitment[],
  historicalCommitments: { id: string, text: string, owner: { name: string } }[]
) {
  const created: ExtractedCommitment[] = []
  const resolved: { historicalId: string, newStatus: 'FULFILLED', resolvedInMeetingId: string }[] = []
  const referenced: string[] = []
  const matchedHistoricalIds = new Set<string>()

  for (const extracted of newExtractions) {
    const ownerHistory = historicalCommitments.filter(
      h => h.owner.name.toLowerCase() === extracted.owner_name.toLowerCase()
    )

    let bestScore = SIMILARITY_THRESHOLD
    let bestMatch = null

    for (const historical of ownerHistory) {
      let score = calculateSimilarityScore(extracted.text, historical.text)
      
      const normExt = normalizeText(extracted.text)
      const normHist = normalizeText(historical.text)
      
      // Boost if prefix matches heavily
      if (normExt && normHist && normExt.slice(0, 10) === normHist.slice(0, 10)) {
        score = Math.min(score + 0.1, 1.0)
      }

      if (score > bestScore) {
        bestScore = score
        bestMatch = historical
      }
    }

    if (!bestMatch) {
      created.push(extracted)
    } else {
      matchedHistoricalIds.add(bestMatch.id)
      
      // Resolution detection
      const lowerText = extracted.text.toLowerCase()
      const hasNonCompletion = NON_COMPLETION_PHRASES.some(phrase => lowerText.includes(phrase))
      const hasCompletionKeyword = COMPLETION_KEYWORDS.some(kw => lowerText.includes(kw))

      if (!hasNonCompletion && hasCompletionKeyword) {
        // Ideally we would run a fast binary LLM check here via `claudeClient`. 
        // We'll approximate for now based on keywords.
        resolved.push({
          historicalId: bestMatch.id,
          newStatus: 'FULFILLED',
          resolvedInMeetingId: meetingId
        })
      } else {
        referenced.push(bestMatch.id)
      }
    }
  }

  const unchanged = historicalCommitments.filter(h => !matchedHistoricalIds.has(h.id))

  return { created, resolved, referenced, unchanged }
}
