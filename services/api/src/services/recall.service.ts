// ─────────────────────────────────────────────────────────────────────────────
// recall.service.ts — Recall.ai REST API Client
//
// Clean abstraction — nothing outside this file knows Recall.ai's API shape.
// If Recall.ai changes their API, ONLY this file changes.
//
// Auth: Token-based (not Bearer). Uses a dedicated fetch instance.
// Timeout: 15 seconds
// Retry: 3 attempts with exponential backoff on 429 + 5xx
//
// Security:
//   RECALL_API_KEY loaded once at module init — never logged, never in errors.
//   Sentry: Authorization header scrubbed via beforeSend hook.
// ─────────────────────────────────────────────────────────────────────────────

import { env } from '../config/env'
import { logger } from '../config/logger'
import { IntegrationError, AppError } from '../utils/errors'
import type { RecallScheduleBotInput, RecallScheduleBotResult } from '../modules/meetings/meetings.types'

// ── Config ────────────────────────────────────────────────────────────────────

const RECALL_BASE_URL = 'https://ap-northeast-1.recall.ai/api/v1'
const REQUEST_TIMEOUT_MS = 15_000
const MAX_RETRIES = 3
const RETRY_DELAYS_MS = [1000, 2000, 4000] // exponential backoff
const JITTER_FACTOR = 0.1 // ±10% jitter to prevent thundering herd

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504])

// ── Helpers ───────────────────────────────────────────────────────────────────

function getApiKey(): string {
  const key = env.RECALL_API_KEY
  if (!key) {
    throw new IntegrationError('RECALL_AI', 'RECALL_API_KEY is not configured')
  }
  return key
}

function addJitter(ms: number): number {
  const jitter = ms * JITTER_FACTOR * (Math.random() * 2 - 1) // ±10%
  return Math.max(0, Math.round(ms + jitter))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Core HTTP fetch wrapper for Recall.ai with timeout and retry logic.
 * Retries on: 429, 5xx
 * Does NOT retry on: 4xx (except 429)
 */
async function recallFetch(
  method: string,
  path: string,
  body?: object,
  attempt = 0
): Promise<{ status: number; data: unknown }> {
  const url = `${RECALL_BASE_URL}${path}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  const startTime = Date.now()

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Token ${getApiKey()}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Vocaply-API/1.0',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })

    const responseTime = Date.now() - startTime
    logger.debug(
      { method, path, status: response.status, responseTimeMs: responseTime },
      'Recall.ai request completed'
    )

    // ── Retry logic ────────────────────────────────────────────────────────
    if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < MAX_RETRIES) {
      const retryDelay = addJitter(RETRY_DELAYS_MS[attempt] ?? 4000)
      const retryAfterHeader = response.headers.get('Retry-After')
      const delay = retryAfterHeader
        ? parseInt(retryAfterHeader, 10) * 1000
        : retryDelay

      logger.warn(
        { method, path, status: response.status, attempt, delayMs: delay },
        'Recall.ai request failed — retrying'
      )
      await sleep(delay)
      return recallFetch(method, path, body, attempt + 1)
    }

    // ── Parse body ─────────────────────────────────────────────────────────
    let data: unknown = null
    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      data = await response.json()
    }

    return { status: response.status, data }
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new IntegrationError('RECALL_AI', `Request timeout after ${REQUEST_TIMEOUT_MS}ms: ${method} ${path}`)
    }

    if (attempt < MAX_RETRIES) {
      const delay = addJitter(RETRY_DELAYS_MS[attempt] ?? 4000)
      logger.warn({ method, path, attempt, error }, 'Recall.ai network error — retrying')
      await sleep(delay)
      return recallFetch(method, path, body, attempt + 1)
    }

    throw new IntegrationError('RECALL_AI', `Network error after ${MAX_RETRIES} retries: ${(error as Error).message}`)
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Map Recall.ai HTTP status codes to typed internal errors.
 */
function mapRecallError(status: number, data: unknown, context: string): never {
  let msg = 'Unknown error'
  if (data && typeof data === 'object') {
    if ('detail' in data && typeof (data as any).detail === 'string') {
      msg = (data as any).detail
    } else if ('message' in data && typeof (data as any).message === 'string') {
      msg = (data as any).message
    } else {
      msg = JSON.stringify(data)
    }
  }

  switch (status) {
    case 401:
      logger.error({ context }, 'RECALL_AI: API key invalid — check RECALL_API_KEY env var')
      throw new IntegrationError('RECALL_AI', `Authentication failed — invalid API key`)
    case 402:
      logger.error({ context }, 'RECALL_AI: Quota exceeded — ops alert required')
      throw new AppError('RECALL_AI_QUOTA_EXCEEDED', 502, `Recall.ai quota exceeded — contact support`)
    case 404:
      throw new AppError('RECALL_BOT_NOT_FOUND', 404, `Recall.ai bot not found`)
    case 422:
      throw new AppError('RECALL_INVALID_URL', 422, `Recall.ai rejected the meeting URL: ${msg}`)
    default:
      throw new IntegrationError('RECALL_AI', `${context} failed (${status}): ${msg}`)
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Schedule a Recall.ai bot to join a meeting.
 *
 * The bot joins 2 minutes BEFORE scheduledAt (calculated by caller).
 * Returns the Recall.ai bot ID — stored as recallBotId in the meetings table.
 *
 * Payload docs: https://docs.recall.ai/reference/bot_create
 */
export async function scheduleBot(input: RecallScheduleBotInput): Promise<RecallScheduleBotResult> {
  const webhookUrl = env.API_URL
    ? `${env.API_URL}/api/webhooks/recall`
    : null

  const payload = {
    meeting_url: input.meetingUrl,
    join_at: input.joinAt.toISOString(),
    bot_name: 'Vocaply',
    ...(webhookUrl && { webhook_url: webhookUrl }),
    recording_config: {
      transcript: {
        provider: {
          recallai_streaming: {
            mode: 'prioritize_accuracy',
            language_code: 'auto'
          }
        },
        diarization: {
          use_separate_streams_when_available: true
        }
      }
    },
    metadata: {
      teamId: input.teamId,
      ...(input.meetingId && { meetingId: input.meetingId }),
      source: 'vocaply-api',
    },
  }

  logger.info(
    { teamId: input.teamId, meetingId: input.meetingId, joinAt: input.joinAt },
    'Scheduling Recall.ai bot'
  )

  const { status, data } = await recallFetch('POST', '/bot/', payload)

  if (status !== 200 && status !== 201) {
    mapRecallError(status, data, 'scheduleBot')
  }

  const botId = (data as any)?.id
  if (!botId || typeof botId !== 'string') {
    throw new IntegrationError('RECALL_AI', 'scheduleBot: missing bot ID in response')
  }

  logger.info({ teamId: input.teamId, botId }, 'Recall.ai bot scheduled successfully')
  return { botId }
}

/**
 * Remove (delete) a Recall.ai bot from a meeting.
 *
 * Idempotent — if the bot is already removed (404 from Recall.ai), treat as success.
 * Only throw on 5xx.
 */
export async function removeBot(botId: string): Promise<void> {
  logger.info({ botId }, 'Removing Recall.ai bot')

  const { status, data } = await recallFetch('DELETE', `/bot/${botId}/`)

  if (status === 404) {
    // Bot already removed — idempotent success
    logger.info({ botId }, 'Recall.ai bot already removed — treating as success')
    return
  }

  if (status !== 200 && status !== 204) {
    mapRecallError(status, data, 'removeBot')
  }

  logger.info({ botId }, 'Recall.ai bot removed successfully')
}

/**
 * Get the current status of a Recall.ai bot.
 * Used for debugging and admin tooling — NOT on the hot request path.
 */
export async function getBotStatus(botId: string): Promise<{
  id: string
  status: string
  statusChanges: Array<{ code: string; created_at: string }>
}> {
  const { status, data } = await recallFetch('GET', `/bot/${botId}/`)

  if (status !== 200) {
    mapRecallError(status, data, 'getBotStatus')
  }

  const bot = data as any
  const latestStatus = bot.status_changes?.slice(-1)?.[0]?.code ?? 'unknown'

  return {
    id: bot.id,
    status: latestStatus,
    statusChanges: bot.status_changes ?? [],
  }
}

/**
 * Get the transcript for a Recall.ai bot.
 */
export async function getTranscript(botId: string): Promise<any[]> {
  logger.info({ botId }, 'Fetching transcript from Recall.ai')
  
  // The GET /bot/{id}/transcript endpoint is deprecated (returns 400).
  // We must fetch the bot and download the transcript from its S3 presigned URL.
  const { status, data } = await recallFetch('GET', `/bot/${botId}/`)

  if (status !== 200 || !data) {
    logger.warn({ botId, status, data }, 'Failed to fetch bot from Recall.ai for transcript')
    return []
  }

  const bot = data as any
  const recording = bot.recordings?.[0]
  const downloadUrl = recording?.transcript?.data?.download_url || recording?.media_shortcuts?.transcript?.data?.download_url

  if (!downloadUrl) {
    logger.info({ botId }, 'No transcript download URL found yet on the bot object')
    return []
  }

  try {
    const res = await fetch(downloadUrl)
    if (!res.ok) {
      logger.warn({ botId, status: res.status }, 'Failed to download transcript from S3 url')
      return []
    }
    
    const dataObj = await res.json() as any
    
    // Depending on the structure of the JSON downloaded from S3...
    if (Array.isArray(dataObj)) {
      return dataObj
    }
    
    if (dataObj && dataObj.transcript && Array.isArray(dataObj.transcript)) {
      return dataObj.transcript
    }
    
    if (dataObj && Array.isArray(dataObj.segments)) {
       return dataObj.segments
    }
    
    return dataObj || []
  } catch (error) {
    logger.error({ botId, error }, 'Error downloading transcript JSON')
    return []
  }
}
