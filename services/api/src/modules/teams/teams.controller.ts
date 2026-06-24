// ─────────────────────────────────────────────────────────────────────────────
// teams.controller.ts — HTTP Layer (Request/Response Only)
//
// RULES:
//   ✅ Reads req, calls service, writes res — nothing else
//   ✅ Zero business logic, zero DB knowledge, zero cache knowledge
//   ✅ Every function is a thin wrapper around the service
// ─────────────────────────────────────────────────────────────────────────────

import { teamsService } from './teams.service'
import { teamHealthService } from './team-health.service'
import { success } from '../../utils/response'
import { asyncHandler } from '../../utils/async-handler'

export const teamsController = {
  /**
   * POST /api/v1/teams
   * Create a new team. Authenticated user becomes OWNER.
   */
  createTeam: asyncHandler(async (req, res) => {
    const result = await teamsService.createTeam(req.user!.id, req.body)
    res.status(201).json(success(result))
  }),

  /**
   * GET /api/v1/teams/me
   * Get current team with members + usage stats.
   */
  getMyTeam: asyncHandler(async (req, res) => {
    const result = await teamsService.getTeamWithMembers(req.teamId!)
    res.status(200).json(success(result))
  }),

  /**
   * PATCH /api/v1/teams/me
   * Update team name and/or settings. Requires ADMIN+.
   */
  updateMyTeam: asyncHandler(async (req, res) => {
    const result = await teamsService.updateTeamSettings(req.teamId!, req.body)
    res.status(200).json(success(result))
  }),

  /**
   * POST /api/v1/teams/me/invite
   * Invite one or more members. Requires ADMIN+.
   */
  inviteMembers: asyncHandler(async (req, res) => {
    const result = await teamsService.inviteMembers(req.teamId!, req.user!.id, req.body)
    res.status(200).json(success(result))
  }),

  /**
   * GET /api/v1/teams/me/members
   * List members with optional filters and pagination.
   */
  listMembers: asyncHandler(async (req, res) => {
    const result = await teamsService.listMembers(req.teamId!, req.query as any)
    const { members, pagination } = result
    res.status(200).json(success({ members }, pagination))
  }),

  /**
   * PATCH /api/v1/teams/me/members/:userId/role
   * Change a member's role. Requires ADMIN+.
   */
  changeMemberRole: asyncHandler(async (req, res) => {
    const result = await teamsService.changeMemberRole(
      req.teamId!,
      req.user!.id,
      req.params.userId as string,
      req.body.role
    )
    res.status(200).json(success(result))
  }),

  /**
   * DELETE /api/v1/teams/me/members/:userId
   * Remove a member from the team. Requires ADMIN+.
   */
  removeMember: asyncHandler(async (req, res) => {
    const result = await teamsService.removeMember(
      req.teamId!,
      req.user!.id,
      req.params.userId as string
    )
    res.status(200).json(success(result))
  }),

  /**
   * POST /api/v1/teams/invite/:token
   * Accept a team invitation. User must be authenticated.
   */
  acceptInvitation: asyncHandler(async (req, res) => {
    const result = await teamsService.acceptInvitation(req.params.token as string, req.user!.id)
    res.status(200).json(success(result))
  }),

  /**
   * GET /api/v1/teams/check-slug?slug=xxx
   * Check slug availability. Public endpoint (IP rate limited).
   */
  checkSlug: asyncHandler(async (req, res) => {
    const slug = req.query.slug as string
    const result = await teamsService.checkSlugAvailability(slug)
    res.status(200).json(success(result))
  }),

  /**
   * GET /api/v1/teams/me/health
   * Get team health score (0–100). Cached 5 minutes.
   */
  getHealthScore: asyncHandler(async (req, res) => {
    const result = await teamHealthService.calculateTeamHealthScore(req.teamId!)
    res.status(200).json(success(result))
  }),
}
