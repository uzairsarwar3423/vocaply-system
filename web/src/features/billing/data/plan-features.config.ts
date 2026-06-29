// ─────────────────────────────────────────────────────────────────────────────
// Vocaply — features/billing/data/plan-features.config.ts
//
// ONE source of truth for the feature-comparison matrix.
// Used by:
//   1. PlanComparisonTable (today, settings-context, dense)
//   2. Future Day 84 pricing/marketing page (marketing-context, persuasive cards)
//
// "Write the data once, render it twice" — intentional, per master plan §2 rationale.
// If this lived inline in PlanComparisonSheet.tsx, Day 84 would either duplicate
// it or require an awkward refactor under deadline pressure.
// ─────────────────────────────────────────────────────────────────────────────

import type { PlanFeatureRow, PlanPricing, PlanId } from "../types";

// ── Pricing (per-plan price, Stripe price IDs) ────────────────────────────────

export const PLAN_PRICING: PlanPricing[] = [
  {
    planId: "free",
    label: "Free",
    pricePerMonth: 0,
    currency: "usd",
    stripePriceId: null,
  },
  {
    planId: "starter",
    label: "Starter",
    pricePerMonth: 2900, // $29
    currency: "usd",
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER ?? null,
  },
  {
    planId: "growth",
    label: "Growth",
    pricePerMonth: 9900, // $99
    currency: "usd",
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_GROWTH ?? null,
  },
  {
    planId: "business",
    label: "Business",
    pricePerMonth: 29900, // $299
    currency: "usd",
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_BUSINESS ?? null,
  },
  {
    planId: "enterprise",
    label: "Enterprise",
    pricePerMonth: null, // contact sales
    currency: "usd",
    stripePriceId: null,
  },
];

// ── Plan names (display order) ─────────────────────────────────────────────────

export const PLAN_IDS_ORDERED: PlanId[] = [
  "free",
  "starter",
  "growth",
  "business",
  "enterprise",
];

export const PLAN_DISPLAY_NAMES: Record<PlanId, string> = {
  free: "Free",
  starter: "Starter",
  growth: "Growth",
  business: "Business",
  enterprise: "Enterprise",
};

// ── Feature matrix ────────────────────────────────────────────────────────────
// Each row: { feature, category?, free, starter, growth, business, enterprise }
// Values:
//   true / false      → check / dash
//   string            → rendered as text (e.g. "Unlimited", "5 GB", "Up to 10")
//   { label, note? }  → text with optional tooltip note

export const PLAN_FEATURES: PlanFeatureRow[] = [
  // MEETINGS
  {
    feature: "Meetings per month",
    category: "Meetings",
    free: "5",
    starter: "50",
    growth: "Unlimited",
    business: "Unlimited",
    enterprise: "Unlimited",
  },
  {
    feature: "Meeting duration limit",
    category: "Meetings",
    free: "60 min",
    starter: "120 min",
    growth: "Unlimited",
    business: "Unlimited",
    enterprise: "Unlimited",
  },
  {
    feature: "AI transcript & summary",
    category: "Meetings",
    free: true,
    starter: true,
    growth: true,
    business: true,
    enterprise: true,
  },
  {
    feature: "Action item extraction",
    category: "Meetings",
    free: true,
    starter: true,
    growth: true,
    business: true,
    enterprise: true,
  },
  {
    feature: "Commitment tracking",
    category: "Meetings",
    free: false,
    starter: true,
    growth: true,
    business: true,
    enterprise: true,
  },
  // TEAM
  {
    feature: "Team members",
    category: "Team",
    free: "Up to 3",
    starter: "Up to 15",
    growth: "Up to 50",
    business: "Unlimited",
    enterprise: "Unlimited",
  },
  {
    feature: "Roles & permissions",
    category: "Team",
    free: false,
    starter: "Basic",
    growth: "Advanced",
    business: "Advanced",
    enterprise: "Custom",
  },
  {
    feature: "SSO / SAML",
    category: "Team",
    free: false,
    starter: false,
    growth: false,
    business: true,
    enterprise: true,
  },
  // INTEGRATIONS
  {
    feature: "Slack integration",
    category: "Integrations",
    free: false,
    starter: true,
    growth: true,
    business: true,
    enterprise: true,
  },
  {
    feature: "Jira / Linear / Notion",
    category: "Integrations",
    free: false,
    starter: false,
    growth: true,
    business: true,
    enterprise: true,
  },
  {
    feature: "Google / Outlook Calendar",
    category: "Integrations",
    free: true,
    starter: true,
    growth: true,
    business: true,
    enterprise: true,
  },
  {
    feature: "Custom webhooks",
    category: "Integrations",
    free: false,
    starter: false,
    growth: false,
    business: true,
    enterprise: true,
  },
  // STORAGE & DATA
  {
    feature: "Storage",
    category: "Storage & Data",
    free: "1 GB",
    starter: "10 GB",
    growth: "50 GB",
    business: "200 GB",
    enterprise: "Unlimited",
  },
  {
    feature: "Data retention",
    category: "Storage & Data",
    free: "30 days",
    starter: "1 year",
    growth: "3 years",
    business: "Unlimited",
    enterprise: "Unlimited",
  },
  // SUPPORT
  {
    feature: "Support",
    category: "Support",
    free: "Community",
    starter: "Email",
    growth: "Priority email",
    business: "Dedicated CSM",
    enterprise: "White-glove",
  },
  {
    feature: "SLA guarantee",
    category: "Support",
    free: false,
    starter: false,
    growth: false,
    business: true,
    enterprise: true,
  },
];

// ── Cancel-consequence copy ────────────────────────────────────────────────────
// Pure function — single auditable source so billing copy can't silently drift
// from what the backend actually does. (Plan §6.7)

export function getCancelConsequenceCopy(planId: PlanId): string {
  const periodEndCopy =
    "Your subscription will remain active until the end of the current billing period. After that, your team will be moved to the Free plan.";

  const dataRetentionCopy: Record<PlanId, string> = {
    free: "",
    starter:
      " Meeting transcripts and data older than 30 days will no longer be accessible after downgrade.",
    growth:
      " Meeting transcripts and data older than 30 days will no longer be accessible after downgrade.",
    business:
      " Meeting transcripts and data older than 30 days will no longer be accessible after downgrade.",
    enterprise:
      " Contact your account manager before cancelling to arrange data export.",
  };

  const integrationCopy: Record<PlanId, string> = {
    free: "",
    starter: " Slack and premium integrations will be disconnected.",
    growth:
      " Jira, Linear, Notion, Slack, and custom integrations will be disconnected.",
    business:
      " All integrations including custom webhooks and SSO will be disconnected.",
    enterprise: "",
  };

  return `${periodEndCopy}${dataRetentionCopy[planId]}${integrationCopy[planId]}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Formats a price in cents to a display string, e.g. 9900 → "$99" */
export function formatPlanPrice(cents: number | null, currency = "usd"): string {
  if (cents === null) return "Custom";
  if (cents === 0) return "Free";
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(dollars);
}

export function getPlanPricing(planId: PlanId): PlanPricing | undefined {
  return PLAN_PRICING.find((p) => p.planId === planId);
}
