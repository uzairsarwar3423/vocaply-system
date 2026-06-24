// ─────────────────────────────────────────────────────────────────────────────
// teams.service.ts — All Teams Business Logic
//
// RULES:
//   ✅ Calls repository, Redis, email service, Socket.io — nothing else
//   ✅ Throws typed AppError subclasses — never plain Error
//   ✅ Never reads req/res — pure business logic, fully testable
//   ✅ Cache-Aside pattern: write DB → delete cache (not update)
//   ✅ All side effects (email, socket) are non-blocking
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'crypto'
import { PlanType, UserRole } from '@prisma/client'
import { teamsRepository } from './teams.repository'
import { emailService } from '../notifications/email.service'
import { prisma } from '../../db/client'
import { redis } from '../../config/redis'
import { logger } from '../../config/logger'
import { env } from '../../config/env'
import {
  PLAN_LIMITS,
  RESERVED_SLUGS,
  ROLE_LEVELS,
  getUpgradeUrl,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from '../../config/plans.config'
import {
  AppError,
  ForbiddenError,
  NotFoundError,
  DuplicateError,
  PlanLimitError,
} from '../../utils/errors'
import type {
  CreateTeamInput,
  UpdateTeamInput,
  InviteMembersInput,
  ListMembersQuery,
  TeamDetailResponse,
  TeamSettings,
  TeamUsage,
  MemberSummary,
} from './teams.types'

// ── Cache Helpers ─────────────────────────────────────────────────────────────

const TEAM_DETAIL_TTL = 300   // 5 minutes
const TEAM_MEMBERS_TTL = 300  // 5 minutes

const CK = {
  teamDetail: (id: string) => `cache:team:detail:${id}`,
  teamMembers: (id: string) => `cache:team:members:${id}`,
  user: (id: string) => `cache:user:${id}`,
}

async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const v = await redis.get(key)
    return v ? (JSON.parse(v) as T) : null
  } catch {
    return null
  }
}

async function cacheSet(key: string, ttl: number, value: unknown): Promise<void> {
  try {
    await redis.setex(key, ttl, JSON.stringify(value))
  } catch {
    // Non-fatal
  }
}

async function cacheDel(...keys: string[]): Promise<void> {
  try {
    if (keys.length > 0) await redis.del(...keys)
  } catch {
    // Non-fatal
  }
}

// ── Slug Utilities ────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
}

function randomSuffix(length = 4): string {
  return crypto.randomBytes(length).toString('hex').slice(0, length)
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

// ── Role Sort (SQL enum order ≠ our desired order) ────────────────────────────

const ROLE_DISPLAY_ORDER: Record<UserRole, number> = {
  OWNER: 0,
  ADMIN: 1,
  MANAGER: 2,
  MEMBER: 3,
}

function sortMembersByRole<T extends { role: UserRole }>(members: T[]): T[] {
  return [...members].sort(
    (a, b) => ROLE_DISPLAY_ORDER[a.role] - ROLE_DISPLAY_ORDER[b.role]
  )
}

// ── Default team settings ─────────────────────────────────────────────────────

const DEFAULT_TEAM_SETTINGS: TeamSettings = {
  defaultTimezone: 'UTC',
  weeklyDigestEnabled: true,
  weeklyDigestDay: 'MONDAY',
  allowMembersToInvite: false,
}

// ── Service Functions ─────────────────────────────────────────────────────────

/**
 * Create a new team for the given user.
 * Business rules:
 *   - One team per user (v1) — user.teamId must be null
 *   - Slug is auto-generated from name if not provided
 *   - Reserved slugs are blocked
 *   - Slug must be globally unique (case-insensitive)
 *   - Creator becomes OWNER in atomic transaction
 */
async function createTeam(userId: string, input: CreateTeamInput) {
  // STEP 1 — Slug Processing
  let slug = input.slug
    ? slugify(input.slug)
    : slugify(input.name)

  if (slug.length < 2) {
    slug = `team-${randomSuffix(6)}`
  }

  // STEP 2 — Reserved slug check
  if (RESERVED_SLUGS.has(slug)) {
    throw new DuplicateError('This slug is reserved and cannot be used', {
      field: 'slug',
      suggestion: `${slug}-${randomSuffix()}`,
    })
  }

  // STEP 3 — Uniqueness check
  const existing = await teamsRepository.findBySlug(slug)
  if (existing) {
    // If user provided the slug explicitly, throw with suggestion
    if (input.slug) {
      throw new DuplicateError('This slug is already in use', {
        field: 'slug',
        suggestion: `${slug}-${randomSuffix()}`,
      })
    }
    // Auto-generated slug taken → append suffix
    slug = `${slug}-${randomSuffix()}`
  }

  // STEP 4 — Check user not already in a team
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, teamId: true },
  })
  if (!user) {
    throw new AppError('USER_NOT_FOUND', 404, 'User not found')
  }
  if (user.teamId) {
    throw new ForbiddenError('You are already a member of a team. Leave your current team first.', {
      code: 'ALREADY_IN_TEAM',
    })
  }

  // STEP 5 — Atomic creation (team + user update + notif preferences)
  const team = await teamsRepository.create({
    name: input.name.trim(),
    slug,
    creatorId: userId,
  })

  // STEP 6 — Cache invalidation
  await cacheDel(CK.user(userId))

  // STEP 7 — Audit log (fire and forget)
  prisma.usageEvent.create({
    data: {
      teamId: team.id,
      type: 'API_CALL',
      quantity: 1,
      metadata: { event: 'TEAM_CREATED', createdBy: userId },
    },
  }).catch((err: unknown) => logger.error({ err }, 'Failed to write TEAM_CREATED usage event'))

  logger.info({ teamId: team.id, userId, slug }, 'Team created')

  return {
    id: team.id,
    name: team.name,
    slug: team.slug,
    plan: team.plan,
    createdAt: team.createdAt,
  }
}

/**
 * Get full team detail: team + members + usage stats.
 * Result is cached for 5 minutes.
 */
async function getTeamWithMembers(teamId: string): Promise<TeamDetailResponse> {
  // STEP 1 — Cache check
  const cached = await cacheGet<TeamDetailResponse>(CK.teamDetail(teamId))
  if (cached) return cached

  // STEP 2 — DB fetch
  const team = await teamsRepository.findById(teamId)
  if (!team) throw new NotFoundError('Team', teamId)

  // STEP 3 — Sort members by role hierarchy
  const sortedMembers = sortMembersByRole(team.members)

  // STEP 4 — Build usage object
  const plan = team.plan as PlanType
  const limits = PLAN_LIMITS[plan]
  const membersCount = sortedMembers.length
  const meetingsUsed = team.meetingsUsed

  const usage: TeamUsage = {
    meetingsUsed,
    meetingsLimit: limits.meetings,
    meetingsPercent:
      limits.meetings === -1 ? 0 : Math.round((meetingsUsed / limits.meetings) * 100),
    membersCount,
    membersLimit: limits.members,
    membersPercent:
      limits.members === -1 ? 0 : Math.round((membersCount / limits.members) * 100),
    historyDays: limits.historyDays,
    apiAccess: limits.apiAccess,
    ssoEnabled: limits.ssoEnabled,
    billingCycleEnd: team.billingCycleEnd,
  }

  // STEP 5 — Sanitize and shape members
  const members: MemberSummary[] = sortedMembers.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    avatarUrl: m.avatarUrl,
    role: m.role,
    commitmentScore: m.commitmentScore,
    joinedAt: m.createdAt,
    lastActiveAt: m.lastActiveAt,
    lastLoginAt: m.lastLoginAt,
  }))

  // STEP 6 — Build settings (merge with defaults for any missing keys)
  const rawSettings = (team.settings ?? {}) as Record<string, unknown>
  const settings: TeamSettings = {
    defaultTimezone: (rawSettings.defaultTimezone as string) ?? DEFAULT_TEAM_SETTINGS.defaultTimezone,
    weeklyDigestEnabled: (rawSettings.weeklyDigestEnabled as boolean) ?? DEFAULT_TEAM_SETTINGS.weeklyDigestEnabled,
    weeklyDigestDay: (rawSettings.weeklyDigestDay as TeamSettings['weeklyDigestDay']) ?? DEFAULT_TEAM_SETTINGS.weeklyDigestDay,
    allowMembersToInvite: (rawSettings.allowMembersToInvite as boolean) ?? DEFAULT_TEAM_SETTINGS.allowMembersToInvite,
  }

  const result: TeamDetailResponse = {
    id: team.id,
    name: team.name,
    slug: team.slug,
    plan: team.plan,
    settings,
    usage,
    members,
    meetingsCount: team._count.meetings,
    createdAt: team.createdAt,
    updatedAt: team.updatedAt,
  }

  // STEP 7 — Cache result
  await cacheSet(CK.teamDetail(teamId), TEAM_DETAIL_TTL, result)

  return result
}

/**
 * Update team name and/or settings.
 * Settings update is a JSONB merge — only provided keys are changed.
 */
async function updateTeamSettings(teamId: string, input: UpdateTeamInput) {
  // STEP 1 — Fetch current state
  const team = await teamsRepository.findById(teamId)
  if (!team) throw new NotFoundError('Team', teamId)

  // STEP 2 — JSONB merge for settings (partial update, not replace)
  const currentSettings = (team.settings ?? {}) as Record<string, unknown>
  const updatedSettings = input.settings
    ? { ...currentSettings, ...input.settings }
    : currentSettings

  // STEP 3 — Update
  const updated = await teamsRepository.update(teamId, {
    name: input.name,
    settings: updatedSettings,
  })

  // STEP 4 — Cache invalidation
  await cacheDel(CK.teamDetail(teamId))

  logger.info({ teamId, changes: Object.keys(input) }, 'Team settings updated')

  const rawSettings = (updated.settings ?? {}) as Record<string, unknown>
  const settings: TeamSettings = {
    defaultTimezone: (rawSettings.defaultTimezone as string) ?? DEFAULT_TEAM_SETTINGS.defaultTimezone,
    weeklyDigestEnabled: (rawSettings.weeklyDigestEnabled as boolean) ?? DEFAULT_TEAM_SETTINGS.weeklyDigestEnabled,
    weeklyDigestDay: (rawSettings.weeklyDigestDay as TeamSettings['weeklyDigestDay']) ?? DEFAULT_TEAM_SETTINGS.weeklyDigestDay,
    allowMembersToInvite: (rawSettings.allowMembersToInvite as boolean) ?? DEFAULT_TEAM_SETTINGS.allowMembersToInvite,
  }

  return {
    id: updated.id,
    name: updated.name,
    slug: updated.slug,
    plan: updated.plan,
    settings,
    updatedAt: updated.updatedAt,
  }
}

/**
 * Invite one or more members to the team.
 * Returns a per-email result object: invited | alreadyMember | alreadyInvited | failed.
 */
async function inviteMembers(
  teamId: string,
  inviterId: string,
  input: InviteMembersInput
) {
  const role = input.role ?? UserRole.MEMBER
  const emails = input.emails

  // STEP 1 — Validate role (cannot invite as OWNER — runtime guard, type already excludes it)
  if ((role as string) === 'OWNER') {
    throw new ForbiddenError('Cannot invite members as OWNER')
  }

  // STEP 2 — Plan member limit check (projected total, excluding OWNER who never consumes a seat)
  const team = await teamsRepository.findById(teamId)
  if (!team) throw new NotFoundError('Team', teamId)

  const currentCount = team.members.filter((m) => m.role !== UserRole.OWNER).length
  const pendingCount = await teamsRepository.countPendingInvitations(teamId)
  const projectedTotal = currentCount + pendingCount + emails.length
  const memberLimit = PLAN_LIMITS[team.plan as PlanType].members

  if (memberLimit !== -1 && projectedTotal > memberLimit) {
    throw new PlanLimitError('Members', currentCount, memberLimit, getUpgradeUrl(team.plan as PlanType))
  }

  // STEP 3 — Fetch inviter info for email
  const inviter = await prisma.user.findUnique({
    where: { id: inviterId },
    select: { name: true, email: true },
  })
  if (!inviter) throw new AppError('USER_NOT_FOUND', 404, 'Inviter not found')

  // STEP 4 — Process each email
  const results = {
    invited: [] as string[],
    alreadyMember: [] as string[],
    alreadyInvited: [] as string[],
    failed: [] as string[],
  }

  const frontendUrl = env.FRONTEND_URL ?? 'http://localhost:3000'

  for (const email of emails) {
    try {
      // a. Check if already a team member
      const existingMember = await prisma.user.findFirst({
        where: { email, teamId },
        select: { id: true },
      })
      if (existingMember) {
        results.alreadyMember.push(email)
        continue
      }

      // b. Check if pending invite exists (non-expired)
      const pendingInvite = await teamsRepository.findPendingInvite(teamId, email)
      if (pendingInvite) {
        results.alreadyInvited.push(email)
        continue
      }

      // c. Generate token (rawToken never stored — only sha256 goes to DB)
      const rawToken = crypto.randomBytes(32).toString('hex') // 256-bit entropy
      const tokenHash = hashToken(rawToken)
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

      // d. Create invitation record
      await teamsRepository.createInvitation({
        teamId,
        invitedEmail: email,
        invitedRole: role,
        invitedById: inviterId,
        tokenHash,
        expiresAt,
      })

      // e. Send invite email (async, non-blocking — email failure is non-fatal)
      const joinUrl = `${frontendUrl}/invite/${rawToken}`
      emailService
        .sendTeamInviteEmail({
          to: email,
          teamName: team.name,
          inviterName: inviter.name,
          joinUrl,
          role,
          expiresAt,
        })
        .catch((err: unknown) => {
          logger.error({ err, email, teamId }, 'Failed to send invite email')
          results.failed.push(email)
        })

      results.invited.push(email)
    } catch (err) {
      logger.error({ err, email, teamId }, 'Error processing invitation for email')
      results.failed.push(email)
    }
  }

  // STEP 5 — Housekeeping: delete expired invitations (best-effort)
  teamsRepository
    .deleteExpiredInvitations(teamId)
    .catch((err: unknown) => logger.warn({ err, teamId }, 'Failed to delete expired invitations'))

  logger.info(
    { teamId, invited: results.invited.length, failed: results.failed.length },
    'Invitation batch processed'
  )

  // STEP 6 — Build general share link (scaffold for Day 20)
  const inviteLink = `${frontendUrl}/teams/${team.slug}/join`

  return { ...results, inviteLink }
}

/**
 * Accept a team invitation using a raw token from the invite URL.
 * User must be authenticated. Token is single-use and expires in 7 days.
 */
async function acceptInvitation(token: string, userId: string) {
  // STEP 1 — Token lookup
  const tokenHash = hashToken(token)
  const invitation = await teamsRepository.findInvitationByToken(tokenHash)
  if (!invitation) {
    throw new AppError('TOKEN_INVALID', 400, 'Invalid or expired invite link')
  }

  // STEP 2 — Expiry check
  if (invitation.expiresAt < new Date()) {
    throw new AppError('TOKEN_EXPIRED', 410, 'This invite link has expired. Ask for a new one.')
  }

  // STEP 3 — Already accepted check
  if (invitation.acceptedAt) {
    throw new AppError('TOKEN_USED', 409, 'This invite link has already been used')
  }

  // STEP 4 — User's current team check
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, teamId: true },
  })
  if (!user) throw new AppError('USER_NOT_FOUND', 404, 'User not found')

  if (user.teamId && user.teamId !== invitation.teamId) {
    throw new ForbiddenError(
      'You are already a member of a different team. Leave it first.',
      { code: 'WRONG_TEAM' }
    )
  }

  // STEP 5 — Atomic transaction: join team + mark invite accepted + create notif prefs
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        teamId: invitation.teamId,
        role: invitation.invitedRole,
        onboardingCompleted: true,
      },
    }),
    prisma.teamInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date(), acceptedById: userId },
    }),
    prisma.notificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        preferences: DEFAULT_NOTIFICATION_PREFERENCES,
      },
      update: {}, // no-op if exists
    }),
  ])

  // STEP 6 — Cache invalidation
  await cacheDel(CK.teamDetail(invitation.teamId), CK.user(userId))

  // STEP 7 — Socket.io event (scaffolded — will be wired when socket server is added)
  // io.to(`team:${invitation.teamId}`).emit('member:joined', { userId })

  logger.info(
    { userId, teamId: invitation.teamId, role: invitation.invitedRole },
    'Member joined team via invitation'
  )

  return {
    teamId: invitation.teamId,
    teamName: invitation.team.name,
    role: invitation.invitedRole,
    message: "You've joined the team!",
  }
}

/**
 * List team members with optional filters. Result is cached for 5 minutes.
 */
async function listMembers(teamId: string, query: ListMembersQuery) {
  const cacheKey = `${CK.teamMembers(teamId)}:${JSON.stringify(query)}`
  const cachedRaw = await cacheGet<{ members: MemberSummary[]; pagination: { page: number; limit: number; total: number; pages: number; hasMore: boolean } }>(cacheKey)
  if (cachedRaw) return cachedRaw

  const result = await teamsRepository.findMembers(teamId, query)

  // Sort by role hierarchy
  const sorted = sortMembersByRole(result.members)

  const response = {
    members: sorted.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      avatarUrl: m.avatarUrl,
      role: m.role,
      commitmentScore: m.commitmentScore,
      joinedAt: m.createdAt,
      lastActiveAt: m.lastActiveAt,
      lastLoginAt: m.lastLoginAt,
    })) as MemberSummary[],
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      pages: Math.ceil(result.total / result.limit),
      hasMore: result.page * result.limit < result.total,
    },
  }

  await cacheSet(cacheKey, TEAM_MEMBERS_TTL, response)

  return response
}

/**
 * Change a team member's role.
 * Enforces role hierarchy — cannot assign role >= own level.
 */
async function changeMemberRole(
  teamId: string,
  requesterId: string,
  targetUserId: string,
  newRole: Exclude<UserRole, 'OWNER'>
) {
  // STEP 1 — Fetch target
  const target = await teamsRepository.findMemberById(teamId, targetUserId)
  if (!target) throw new NotFoundError('Team member', targetUserId)

  // STEP 2 — Fetch requester role
  const requester = await prisma.user.findUnique({
    where: { id: requesterId },
    select: { role: true },
  })
  if (!requester) throw new AppError('USER_NOT_FOUND', 404, 'Requester not found')

  // STEP 3 — Business rule guards
  if (target.role === UserRole.OWNER) {
    throw new ForbiddenError('Cannot change the OWNER role', { code: 'CANNOT_CHANGE_OWNER' })
  }
  // Note: newRole type is already Exclude<UserRole, 'OWNER'> — OWNER assignment is blocked at type level
  // Additional runtime guard for defense-in-depth:
  if ((newRole as string) === 'OWNER') {
    throw new ForbiddenError('Cannot assign OWNER role directly. Use transfer ownership.', {
      code: 'CANNOT_ASSIGN_OWNER',
    })
  }
  if (targetUserId === requesterId) {
    throw new ForbiddenError('Cannot change your own role', { code: 'CANNOT_CHANGE_SELF' })
  }

  const requesterLevel = ROLE_LEVELS[requester.role] ?? 0
  const targetNewLevel = ROLE_LEVELS[newRole] ?? 0

  if (targetNewLevel >= requesterLevel) {
    throw new ForbiddenError(
      'Cannot assign a role equal to or higher than your own',
      { code: 'ROLE_ESCALATION', yourRole: requester.role, attempted: newRole }
    )
  }

  // STEP 4 — Update
  const updated = await teamsRepository.updateMemberRole(targetUserId, newRole)

  // STEP 5 — Cache invalidation (3 keys)
  await cacheDel(CK.user(targetUserId), CK.teamMembers(teamId), CK.teamDetail(teamId))

  // STEP 6 — Socket.io event (scaffolded)
  // io.to(`user:${targetUserId}`).emit('my:role_updated', { newRole, teamId })

  logger.info({ teamId, requesterId, targetUserId, newRole }, 'Member role changed')

  return {
    userId: updated.id,
    name: updated.name,
    role: updated.role,
    updatedAt: updated.updatedAt,
  }
}

/**
 * Remove a member from the team.
 * Forces logout by deleting all refresh tokens.
 * Historical data (commitments, action items) is preserved with ownerId.
 */
async function removeMember(
  teamId: string,
  requesterId: string,
  targetUserId: string
) {
  // STEP 1 — Fetch target
  const target = await teamsRepository.findMemberById(teamId, targetUserId)
  if (!target) throw new NotFoundError('Team member', targetUserId)

  // STEP 2 — Fetch requester role
  const requester = await prisma.user.findUnique({
    where: { id: requesterId },
    select: { role: true },
  })
  if (!requester) throw new AppError('USER_NOT_FOUND', 404, 'Requester not found')

  // STEP 3 — Business rule guards
  if (target.role === UserRole.OWNER) {
    throw new ForbiddenError('Cannot remove the team owner', { code: 'CANNOT_REMOVE_OWNER' })
  }
  if (targetUserId === requesterId) {
    throw new ForbiddenError('Cannot remove yourself from the team', { code: 'CANNOT_REMOVE_SELF' })
  }

  const requesterLevel = ROLE_LEVELS[requester.role] ?? 0
  const targetLevel = ROLE_LEVELS[target.role] ?? 0

  if (targetLevel >= requesterLevel) {
    throw new ForbiddenError(
      'Cannot remove a member with an equal or higher role than yours',
      { code: 'INSUFFICIENT_ROLE', yourRole: requester.role, targetRole: target.role }
    )
  }

  // STEP 4 — Atomic removal (clear teamId + delete refresh tokens)
  await teamsRepository.removeMember(targetUserId)

  // STEP 5 — Cache invalidation
  await cacheDel(CK.user(targetUserId), CK.teamDetail(teamId), CK.teamMembers(teamId))

  // STEP 6 — Socket.io events (scaffolded)
  // io.to(`user:${targetUserId}`).emit('system:removed_from_team', { teamId })
  // io.to(`team:${teamId}`).emit('member:removed', { userId: targetUserId })

  // STEP 7 — Audit log (fire and forget)
  prisma.usageEvent.create({
    data: {
      teamId,
      type: 'API_CALL',
      quantity: 1,
      metadata: {
        event: 'MEMBER_REMOVED',
        removedBy: requesterId,
        removedUser: targetUserId,
      },
    },
  }).catch((err: unknown) => logger.error({ err }, 'Failed to write MEMBER_REMOVED usage event'))

  logger.info({ teamId, requesterId, targetUserId }, 'Member removed from team')

  return { message: 'Member removed successfully', userId: targetUserId }
}

/**
 * Check if a slug is available (public endpoint for onboarding form).
 */
async function checkSlugAvailability(slug: string) {
  const normalized = slug.toLowerCase().trim()

  if (RESERVED_SLUGS.has(normalized)) {
    return {
      available: false,
      slug: normalized,
      suggestion: `${normalized}-${randomSuffix()}`,
    }
  }

  const existing = await teamsRepository.findBySlug(normalized)

  if (existing) {
    return {
      available: false,
      slug: normalized,
      suggestion: `${normalized}-${randomSuffix()}`,
    }
  }

  return { available: true, slug: normalized }
}

// ── Export ────────────────────────────────────────────────────────────────────

export const teamsService = {
  createTeam,
  getTeamWithMembers,
  updateTeamSettings,
  inviteMembers,
  acceptInvitation,
  listMembers,
  changeMemberRole,
  removeMember,
  checkSlugAvailability,
}
