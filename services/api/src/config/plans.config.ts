// ─────────────────────────────────────────────────────────────────────────────
// plans.config.ts — Single Source of Truth for All Plan Limits
//
// CRITICAL: This file is the ONLY place where plan limits are defined.
// Referenced by: middleware, service layer, billing API, frontend pricing page.
//
// -1 = unlimited (sentinel value used throughout the codebase)
// PlanType is imported from Prisma to guarantee enum sync.
//
// Frontend pricing page values (pricing.content.ts) are the authoritative source.
// ─────────────────────────────────────────────────────────────────────────────

import { PlanType } from '@prisma/client'

// ── Plan Limit Shape ──────────────────────────────────────────────────────────

export interface PlanLimits {
  /** Max meetings per billing cycle. -1 = unlimited. */
  meetings: number
  /** Max team members (active + accepted). -1 = unlimited. */
  members: number
  /** Days of history retained. -1 = unlimited. */
  historyDays: number
  /** Max third-party integrations (Jira, Slack, Linear, Notion). -1 = unlimited. */
  integrations: number
  /** Storage in GB. -1 = unlimited. */
  storageGB: number
  /** Whether REST API access and webhook registrations are allowed. */
  apiAccess: boolean
  /** Whether SSO (SAML/SCIM) is enabled. */
  ssoEnabled: boolean
  /** Monthly price in USD cents (for reference only — billing handled by Stripe). */
  monthlyPriceCents: number
}

// ── Plan Limits Table ─────────────────────────────────────────────────────────
//
//                  FREE    STARTER    GROWTH    BUSINESS    ENTERPRISE
// meetings/month:    5        40        120        300           -1
// members/team:      3        10         25         60           -1
// historyDays:       7        90        365         -1           -1
// integrations:      1        -1         -1         -1           -1
// storageGB:         1        10         50         -1           -1
// apiAccess:       false    false      false       true         true
// ssoEnabled:      false    false      false      false         true
// monthlyPrice:      $0       $49        $99       $199         custom
//
// Source: web/src/lib/marketing/content/pricing.content.ts

export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  FREE: {
    meetings: 5,
    members: 3,
    historyDays: 7,
    integrations: 1,
    storageGB: 1,
    apiAccess: false,
    ssoEnabled: false,
    monthlyPriceCents: 0,
  },

  STARTER: {
    meetings: 40,
    members: 10,
    historyDays: 90,
    integrations: -1,
    storageGB: 10,
    apiAccess: false,
    ssoEnabled: false,
    monthlyPriceCents: 4900,
  },

  GROWTH: {
    meetings: 120,
    members: 25,
    historyDays: 365,
    integrations: -1,
    storageGB: 50,
    apiAccess: false,
    ssoEnabled: false,
    monthlyPriceCents: 9900,
  },

  BUSINESS: {
    meetings: 300,
    members: 60,
    historyDays: -1,
    integrations: -1,
    storageGB: -1,
    apiAccess: true,
    ssoEnabled: false,
    monthlyPriceCents: 19900,
  },

  ENTERPRISE: {
    meetings: -1,
    members: -1,
    historyDays: -1,
    integrations: -1,
    storageGB: -1,
    apiAccess: true,
    ssoEnabled: true,
    monthlyPriceCents: -1, // Custom pricing via sales
  },
} as const

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Get a specific limit for a plan.
 * Returns the raw value (-1 means unlimited).
 */
export function getPlanLimit<K extends keyof PlanLimits>(
  plan: PlanType,
  resource: K
): PlanLimits[K] {
  return PLAN_LIMITS[plan][resource]
}

/**
 * Check if a plan has unlimited access to a numeric resource.
 * Only works for numeric fields.
 */
export function isUnlimited(plan: PlanType, resource: keyof PlanLimits): boolean {
  return (PLAN_LIMITS[plan][resource] as number) === -1
}

/**
 * Check whether a given usage count would exceed the plan limit.
 * Returns true if the operation should be BLOCKED.
 */
export function isLimitExceeded(
  plan: PlanType,
  resource: keyof PlanLimits,
  currentUsage: number
): boolean {
  const limit = PLAN_LIMITS[plan][resource] as number
  if (limit === -1) return false // unlimited
  return currentUsage >= limit
}

/**
 * Compute the upgrade URL for a given plan.
 * Returned in PlanLimitError details so clients can deep-link to billing.
 */
export function getUpgradeUrl(currentPlan: PlanType): string {
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000'
  return `${frontendUrl}/settings/billing?current=${currentPlan}`
}

// ── Ordered plan tiers (ascending) ───────────────────────────────────────────

export const PLAN_ORDER: PlanType[] = [
  PlanType.FREE,
  PlanType.STARTER,
  PlanType.GROWTH,
  PlanType.BUSINESS,
  PlanType.ENTERPRISE,
]

/**
 * Returns true if `planA` is strictly higher tier than `planB`.
 */
export function isPlanHigherThan(planA: PlanType, planB: PlanType): boolean {
  return PLAN_ORDER.indexOf(planA) > PLAN_ORDER.indexOf(planB)
}

// ── Reserved slugs (blocked from team creation) ───────────────────────────────

export const RESERVED_SLUGS = new Set([
  'api',
  'admin',
  'app',
  'www',
  'mail',
  'dev',
  'staging',
  'dashboard',
  'login',
  'register',
  'vocaply',
  'support',
  'help',
  'blog',
  'pricing',
  'about',
  'contact',
  'terms',
  'privacy',
  'docs',
  'status',
  'health',
  'metrics',
  'internal',
  'onboarding',
  'invite',
  'settings',
  'billing',
  'analytics',
  'reports',
])

// ── Role hierarchy (used across multiple modules) ─────────────────────────────

export const ROLE_LEVELS: Record<string, number> = {
  OWNER: 4,
  ADMIN: 3,
  MANAGER: 2,
  MEMBER: 1,
} as const

// ── Default notification preferences (applied on team join) ──────────────────

export const DEFAULT_NOTIFICATION_PREFERENCES = {
  emailOnCommitmentMissed: true,
  emailOnDeadlineToday: true,
  emailOnDeadlineTomorrow: true,
  emailWeeklyDigest: true,
  weeklyDigestDay: 'MONDAY',
  slackOnCommitmentMissed: true,
  slackOnDeadlineToday: true,
  inAppAll: true,
} as const
