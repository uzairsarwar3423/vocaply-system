// ─────────────────────────────────────────────────────────────────────────────
// meetings.service.state.ts — Meeting State Machine
//
// Pure function — no side effects, no dependencies.
// Imported by both meetings.service.ts and meetings.repository.ts
// for defense-in-depth state machine enforcement.
//
// Why two layers?
//   Service:    First check — business logic layer catches invalid calls early
//   Repository: Second check — DB layer catches rogue callers (e.g., buggy workers)
// ─────────────────────────────────────────────────────────────────────────────

import type { MeetingStatus } from '@prisma/client'
import { AppError } from '../../utils/errors'

// ── Valid Transition Matrix ───────────────────────────────────────────────────
//
//  State machine for the 7-state Vocaply meeting lifecycle:
//
//  SCHEDULED   → BOT_JOINING (webhook: bot.joining_call)
//  SCHEDULED   → CANCELLED   (user: DELETE /meetings/:id/bot)
//  BOT_JOINING → RECORDING   (webhook: bot.recording_started)
//  BOT_JOINING → FAILED      (webhook: bot.failed — could not enter)
//  BOT_JOINING → CANCELLED   (webhook: meeting ended before bot entered)
//  RECORDING   → PROCESSING  (webhook: bot.done)
//  RECORDING   → FAILED      (webhook: bot.failed — kicked/crashed)
//  PROCESSING  → DONE        (worker: extraction completed successfully)
//  PROCESSING  → FAILED      (worker: extraction failed after max retries)
//  DONE        → (none)      TERMINAL
//  FAILED      → (none)      TERMINAL — admin creates new meeting to retry
//  CANCELLED   → (none)      TERMINAL

const VALID_TRANSITIONS: Readonly<Record<MeetingStatus, MeetingStatus[]>> = {
  SCHEDULED:   ['BOT_JOINING', 'RECORDING', 'PROCESSING', 'FAILED', 'CANCELLED'],
  BOT_JOINING: ['RECORDING', 'PROCESSING', 'FAILED', 'CANCELLED'],
  RECORDING:   ['PROCESSING', 'FAILED'],
  PROCESSING:  ['DONE', 'FAILED'],
  DONE:        [],
  FAILED:      [],
  CANCELLED:   [],
} as const

// ── Terminal States ───────────────────────────────────────────────────────────

export const TERMINAL_STATES = new Set<MeetingStatus>(['DONE', 'FAILED', 'CANCELLED'])

// ── State Machine Validator ───────────────────────────────────────────────────

/**
 * Validate that a state transition is permitted.
 * Throws AppError(INVALID_STATUS_TRANSITION, 409) if invalid.
 *
 * Called in:
 *   1. meetings.service.ts — before any business logic executes
 *   2. meetings.repository.updateStatus() — defense in depth
 *
 * Duplicate webhook handling:
 *   Recall.ai retries webhooks on failure. A duplicate webhook (e.g., second
 *   bot.recording_started when already in RECORDING) will hit this check and
 *   throw a typed error — the webhook handler should treat this as a no-op.
 */
export function validateTransition(from: MeetingStatus, to: MeetingStatus): void {
  const allowed = VALID_TRANSITIONS[from]

  if (!allowed || !allowed.includes(to)) {
    throw new AppError(
      'INVALID_STATUS_TRANSITION',
      409,
      `Cannot transition meeting from ${from} to ${to}. Allowed transitions from ${from}: [${allowed?.join(', ') || 'none — terminal state'}]`,
      { from, to, allowed: allowed ?? [] }
    )
  }
}

/**
 * Check if a state is a terminal state.
 * Terminal states cannot be transitioned to any other state.
 */
export function isTerminalState(status: MeetingStatus): boolean {
  return TERMINAL_STATES.has(status)
}

/**
 * Get all allowed next states for a given status.
 * Useful for building admin UI state transition options.
 */
export function getAllowedTransitions(from: MeetingStatus): MeetingStatus[] {
  return VALID_TRANSITIONS[from] ?? []
}
