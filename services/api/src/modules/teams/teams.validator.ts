// ─────────────────────────────────────────────────────────────────────────────
// teams.validator.ts — Zod Schemas for All Teams Endpoints
//
// Used by: route middleware (validate()) and controller param extraction.
// All schemas are strict — unknown keys are stripped.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod'
import { UserRole } from '@prisma/client'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Valid IANA timezone check.
 * Uses Intl.supportedValuesOf if available (Node 18+), otherwise allows any string.
 */
function isValidIANATimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** Valid slug regex: lowercase alphanumeric and hyphens, no leading/trailing hyphen */
const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/

// ── Schemas ───────────────────────────────────────────────────────────────────

/**
 * POST /teams — Create a new team.
 */
export const createTeamSchema = {
  body: z.object({
    name: z
      .string()
      .trim()
      .min(2, 'Team name must be at least 2 characters')
      .max(100, 'Team name must be at most 100 characters'),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(2, 'Slug must be at least 2 characters')
      .max(50, 'Slug must be at most 50 characters')
      .regex(SLUG_REGEX, 'Slug must contain only lowercase letters, numbers, and hyphens (no leading/trailing hyphens)')
      .optional(),
  }),
}

/**
 * PATCH /teams/me — Update team name and/or settings.
 */
export const updateTeamSchema = {
  body: z.object({
    name: z
      .string()
      .trim()
      .min(2, 'Team name must be at least 2 characters')
      .max(100, 'Team name must be at most 100 characters')
      .optional(),
    settings: z
      .object({
        defaultTimezone: z
          .string()
          .refine(isValidIANATimezone, { message: 'Must be a valid IANA timezone (e.g. "America/New_York")' })
          .optional(),
        weeklyDigestEnabled: z.boolean().optional(),
        weeklyDigestDay: z
          .enum(['MONDAY', 'FRIDAY', 'SUNDAY'])
          .optional(),
        allowMembersToInvite: z.boolean().optional(),
      })
      .optional(),
  }).refine(
    (data) => data.name !== undefined || data.settings !== undefined,
    { message: 'At least one field (name or settings) must be provided' }
  ),
}

/**
 * POST /teams/me/invite — Invite members to the team.
 */
export const inviteMembersSchema = {
  body: z.object({
    emails: z
      .array(
        z
          .string()
          .email('Each item must be a valid email address')
          .toLowerCase()
          .trim()
      )
      .min(1, 'At least one email is required')
      .max(20, 'Cannot invite more than 20 members at once')
      .transform((emails) => [...new Set(emails)]), // deduplicate
    role: z
      .enum([UserRole.MEMBER, UserRole.MANAGER, UserRole.ADMIN])
      .default(UserRole.MEMBER)
      .describe('Cannot invite as OWNER — use transfer ownership'),
  }),
}

/**
 * PATCH /teams/me/members/:userId/role — Change a member's role.
 */
export const changeMemberRoleSchema = {
  body: z.object({
    role: z
      .enum([UserRole.MEMBER, UserRole.MANAGER, UserRole.ADMIN])
      .describe('OWNER role cannot be assigned directly — use transfer ownership endpoint'),
  }),
  params: z.object({
    userId: z.string().min(1, 'userId is required'),
  }),
}

/**
 * DELETE /teams/me/members/:userId — Remove a member.
 */
export const removeMemberSchema = {
  params: z.object({
    userId: z.string().min(1, 'userId is required'),
  }),
}

/**
 * GET /teams/me/members — List team members with optional filters.
 */
export const listMembersSchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    role: z
      .enum([UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.MEMBER])
      .optional(),
    search: z.string().trim().max(100).optional(),
  }),
}

/**
 * GET /teams/check-slug?slug=xxx — Check slug availability (public).
 */
export const checkSlugSchema = {
  query: z.object({
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(2, 'Slug must be at least 2 characters')
      .max(50, 'Slug must be at most 50 characters'),
  }),
}

/**
 * POST /teams/invite/:token — Accept an invitation.
 * Token comes from URL params, no body required.
 */
export const acceptInvitationSchema = {
  params: z.object({
    token: z.string().min(1, 'Invite token is required'),
  }),
}
