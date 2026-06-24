// ─────────────────────────────────────────────────────────────────────────────
// teams.routes.ts — Route Definitions
//
// Middleware order is security-critical:
//   1. requireAuth   — verify JWT, set req.user (ALWAYS first)
//   2. injectTenant  — set req.teamId from req.user.teamId
//   3. requireRole   — check ROLE_LEVELS[req.user.role]
//   4. validate      — parse/validate body AFTER auth (saves CPU on rejected requests)
//   5. controller    — actual handler
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express'
import { teamsController } from './teams.controller'
import { requireAuth } from '../../middleware/auth.middleware'
import { injectTenant } from '../../middleware/tenant.middleware'
import { requireRole } from '../../middleware/role.middleware'
import { validate } from '../../middleware/validate.middleware'
import { ipRateLimiter } from '../../middleware/rate-limit.middleware'
import {
  createTeamSchema,
  updateTeamSchema,
  inviteMembersSchema,
  changeMemberRoleSchema,
  removeMemberSchema,
  listMembersSchema,
  checkSlugSchema,
  acceptInvitationSchema,
} from './teams.validator'

const router = Router()

// ── Public Routes (no auth required) ─────────────────────────────────────────

/**
 * GET /api/v1/teams/check-slug?slug=xxx
 * Check if a slug is available. Used during team onboarding form.
 * IP rate limited to prevent enumeration.
 */
router.get(
  '/check-slug',
  ipRateLimiter,
  validate(checkSlugSchema),
  teamsController.checkSlug
)

// ── Protected: Invite Acceptance (auth only, no team required yet) ────────────

/**
 * POST /api/v1/teams/invite/:token
 * Accept a team invitation. User must be authenticated but not necessarily in a team.
 */
router.post(
  '/invite/:token',
  requireAuth,
  validate(acceptInvitationSchema),
  teamsController.acceptInvitation
)

// ── Protected: Team Creation (any authenticated user) ─────────────────────────

/**
 * POST /api/v1/teams
 * Create a new team. User must be authenticated and NOT already in a team.
 */
router.post(
  '/',
  requireAuth,
  validate(createTeamSchema),
  teamsController.createTeam
)

// ── Protected: Team Routes (require team membership via injectTenant) ─────────

/**
 * GET /api/v1/teams/me
 * Get team detail + members + usage. Any team member can access.
 */
router.get(
  '/me',
  requireAuth,
  injectTenant,
  teamsController.getMyTeam
)

/**
 * GET /api/v1/teams/me/health
 * Get team health score (0–100). Any team member can access.
 */
router.get(
  '/me/health',
  requireAuth,
  injectTenant,
  teamsController.getHealthScore
)

/**
 * GET /api/v1/teams/me/members
 * List members with optional filters. Any team member can access.
 */
router.get(
  '/me/members',
  requireAuth,
  injectTenant,
  validate(listMembersSchema),
  teamsController.listMembers
)

/**
 * PATCH /api/v1/teams/me
 * Update team name and/or settings. Requires ADMIN+.
 */
router.patch(
  '/me',
  requireAuth,
  injectTenant,
  requireRole('ADMIN'),
  validate(updateTeamSchema),
  teamsController.updateMyTeam
)

/**
 * POST /api/v1/teams/me/invite
 * Invite members to the team. Requires ADMIN+.
 */
router.post(
  '/me/invite',
  requireAuth,
  injectTenant,
  requireRole('ADMIN'),
  validate(inviteMembersSchema),
  teamsController.inviteMembers
)

/**
 * PATCH /api/v1/teams/me/members/:userId/role
 * Change a member's role. Requires ADMIN+.
 * Service enforces cannot assign role >= own level.
 */
router.patch(
  '/me/members/:userId/role',
  requireAuth,
  injectTenant,
  requireRole('ADMIN'),
  validate(changeMemberRoleSchema),
  teamsController.changeMemberRole
)

/**
 * DELETE /api/v1/teams/me/members/:userId
 * Remove a member. Requires ADMIN+.
 * Service enforces cannot remove higher-role members.
 */
router.delete(
  '/me/members/:userId',
  requireAuth,
  injectTenant,
  requireRole('ADMIN'),
  validate(removeMemberSchema),
  teamsController.removeMember
)

export const teamsRouter = router
