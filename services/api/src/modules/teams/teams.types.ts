// ─────────────────────────────────────────────────────────────────────────────
// teams.types.ts — TypeScript Interfaces for the Teams Module
// ─────────────────────────────────────────────────────────────────────────────

import type { PlanType, UserRole } from '@prisma/client'

// ── Inbound Request Types (from controller) ───────────────────────────────────

export interface CreateTeamInput {
  name: string
  slug?: string
}

export interface UpdateTeamInput {
  name?: string
  settings?: TeamSettingsInput
}

export interface TeamSettingsInput {
  defaultTimezone?: string
  weeklyDigestEnabled?: boolean
  weeklyDigestDay?: 'MONDAY' | 'FRIDAY' | 'SUNDAY'
  allowMembersToInvite?: boolean
}

export interface InviteMembersInput {
  emails: string[]
  role?: Exclude<UserRole, 'OWNER'>
}

export interface ChangeMemberRoleInput {
  role: Exclude<UserRole, 'OWNER'>
}

export interface ListMembersQuery {
  page?: number
  limit?: number
  role?: UserRole
  search?: string
}

// ── Domain Object Types ───────────────────────────────────────────────────────

export interface TeamSettings {
  defaultTimezone: string
  weeklyDigestEnabled: boolean
  weeklyDigestDay: 'MONDAY' | 'FRIDAY' | 'SUNDAY'
  allowMembersToInvite: boolean
}

export interface TeamUsage {
  meetingsUsed: number
  meetingsLimit: number      // -1 = unlimited
  meetingsPercent: number    // 0-100 (0 if unlimited)
  membersCount: number
  membersLimit: number       // -1 = unlimited
  membersPercent: number     // 0-100 (0 if unlimited)
  historyDays: number        // -1 = unlimited
  apiAccess: boolean
  ssoEnabled: boolean
  billingCycleEnd: Date | null
}

export interface MemberSummary {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  role: UserRole
  commitmentScore: number
  joinedAt: Date
  lastActiveAt: Date | null
  lastLoginAt: Date | null
}

// ── Response Types (from service to controller) ───────────────────────────────

export interface CreatedTeamResponse {
  id: string
  name: string
  slug: string
  plan: PlanType
  createdAt: Date
}

export interface TeamDetailResponse {
  id: string
  name: string
  slug: string
  plan: PlanType
  settings: TeamSettings
  usage: TeamUsage
  members: MemberSummary[]
  meetingsCount: number
  createdAt: Date
  updatedAt: Date
}

export interface UpdatedTeamResponse {
  id: string
  name: string
  slug: string
  plan: PlanType
  settings: TeamSettings
  updatedAt: Date
}

export interface InviteResult {
  invited: string[]
  alreadyMember: string[]
  alreadyInvited: string[]
  failed: string[]
  inviteLink: string
}

export interface AcceptInvitationResponse {
  teamId: string
  teamName: string
  role: UserRole
  message: string
}

export interface ChangedRoleResponse {
  userId: string
  name: string
  role: UserRole
  updatedAt: Date
}

export interface RemoveMemberResponse {
  message: string
  userId: string
}

export interface MembersListResponse {
  members: MemberSummary[]
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
    hasMore: boolean
  }
}

export interface SlugAvailabilityResponse {
  available: boolean
  slug: string
  suggestion?: string
}

// ── Health Score Types ────────────────────────────────────────────────────────

export type HealthTrend = 'improving' | 'stable' | 'declining'

export interface TeamHealthScore {
  score: number              // 0–100
  trend: HealthTrend
  fulfillmentRate: number    // 0–100
  avgMemberScore: number     // 0–100
  onTimeRate: number         // 0–100
  computedAt: Date
  basedOnDays: number        // Number of days of data used
}

// ── Repository Input Types ────────────────────────────────────────────────────

export interface CreateTeamData {
  name: string
  slug: string
  creatorId: string
}

export interface CreateInvitationData {
  teamId: string
  invitedEmail: string
  invitedRole: UserRole
  invitedById: string
  tokenHash: string
  expiresAt: Date
}
