// ─────────────────────────────────────────────────────────────────────────────
// Vocaply — features/billing/types.ts
// All billing-domain TypeScript types for Day 42 and beyond.
// ─────────────────────────────────────────────────────────────────────────────

export type PlanId = "free" | "starter" | "growth" | "business" | "enterprise";

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused";

export interface Subscription {
  id: string;
  teamId: string;
  planId: PlanId;
  status: SubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string; // ISO
  currentPeriodEnd: string; // ISO
  trialEnd: string | null; // ISO
  pricePerMonth: number; // in cents
  currency: string;
  stripeCustomerId: string | null;
}

// ── Usage ─────────────────────────────────────────────────────────────────────

export interface UsageMetric {
  label: string;
  resource: string; // key, e.g. "meetings", "members", "storage"
  used: number;
  limit: number | null; // null = unlimited
  unit?: string; // e.g. "GB" for storage, undefined for counts
}

export interface UsageSummary {
  periodStart: string;
  periodEnd: string;
  metrics: UsageMetric[];
}

// ── Invoices ──────────────────────────────────────────────────────────────────

export type InvoiceStatus = "paid" | "open" | "void" | "uncollectible";

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitAmount: number; // cents
  amount: number; // cents
}

export interface Invoice {
  id: string;
  number: string;
  status: InvoiceStatus;
  date: string; // ISO
  dueDate: string | null; // ISO
  amount: number; // cents
  currency: string;
  description: string;
  pdfUrl: string | null;
  lineItems: InvoiceLineItem[];
  subtotal: number; // cents
  tax: number; // cents
  total: number; // cents
}

export interface InvoiceListResponse {
  invoices: Invoice[];
  hasMore: boolean;
  nextCursor: string | null;
}

// ── Plan comparison matrix ────────────────────────────────────────────────────

export type PlanFeatureValue =
  | boolean
  | string
  | number
  | { label: string; note?: string };

export interface PlanFeatureRow {
  feature: string;
  category?: string;
  free: PlanFeatureValue;
  starter: PlanFeatureValue;
  growth: PlanFeatureValue;
  business: PlanFeatureValue;
  enterprise: PlanFeatureValue;
}

export interface PlanPricing {
  planId: PlanId;
  label: string;
  pricePerMonth: number | null; // null = custom/contact sales
  currency: string;
  stripePriceId: string | null; // null for free / enterprise
}
