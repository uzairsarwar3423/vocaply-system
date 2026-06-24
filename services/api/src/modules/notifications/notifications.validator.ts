// ─────────────────────────────────────────────────────────────────────────────
// notifications.validator.ts — Zod schemas (strict, unknown-key-rejecting)
//
// Key design: z.strict() on the preferences update schema.
// A typo'd key like "emial.meetingSummary" MUST surface as a 422 — it must
// NEVER be silently stripped and make the user believe their preference was saved.
// This is a CORRECTNESS control for notify.worker (which reads specific dotted
// paths from preferences), not just a tidiness concern for today's endpoint.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod'

// ── Update Preferences Schema ─────────────────────────────────────────────────

const emailPrefsSchema = z
  .object({
    meetingSummary: z.boolean(),
    deadlineReminder: z.boolean(),
    commitmentMissed: z.boolean(),
    weeklyDigest: z.boolean(),
    paymentAlerts: z.boolean(),
  })
  .strict()  // unknown keys rejected with 422
  .partial() // all keys optional (PATCH semantics)

const slackPrefsSchema = z
  .object({
    meetingSummary: z.boolean(),
    deadlineReminder: z.boolean(),
    commitmentMissed: z.boolean(),
    dailyDigest: z.boolean(),
    personalDMs: z.boolean(),
  })
  .strict()
  .partial()

const inAppPrefsSchema = z
  .object({
    all: z.boolean(),
  })
  .strict()
  .partial()

export const updatePreferencesSchema = z
  .object({
    email: emailPrefsSchema.optional(),
    slack: slackPrefsSchema.optional(),
    inApp: inAppPrefsSchema.optional(),
  })
  .strict() // top-level unknown keys also rejected

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>

// ── Test Notification Schema ───────────────────────────────────────────────────

export const testNotificationSchema = z.object({
  channel: z.enum(['email', 'slack']),
  type: z.enum([
    'MEETING_PROCESSED',
    'COMMITMENT_MISSED',
    'DEADLINE_REMINDER',
    'DEADLINE_TODAY',
    'MANAGER_ALERT',
    'WEEKLY_DIGEST',
  ]),
})

export type TestNotificationInput = z.infer<typeof testNotificationSchema>
