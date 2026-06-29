"use client";

import React, { useState } from "react";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTeam } from "@/features/team/hooks/useTeam";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { PlanStatusBadge } from "./PlanStatusBadge";
import { BillingPortalButton } from "./BillingPortalButton";
import { UsageProgressRow } from "./UsageProgressRow";
import { PlanComparisonSheet } from "./PlanComparisonSheet";
import { PLAN_DISPLAY_NAMES } from "../data/plan-features.config";
import type { PlanId } from "../types";
import { cn } from "@/lib/utils";

// Map backend PlanType enum (uppercase) to our PlanId (lowercase)
function normalizePlan(plan: string): PlanId {
  return plan.toLowerCase() as PlanId;
}

// Format price from cents to display string
function formatPrice(cents: number): string {
  if (cents === 0) return "Free";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

// Backend plan monthly prices (from plans.config.ts)
const PLAN_PRICES: Record<string, number> = {
  FREE: 0,
  STARTER: 4900,
  GROWTH: 9900,
  BUSINESS: 19900,
  ENTERPRISE: -1, // custom
};

function formatRenewalDate(isoDate: string | null): string | null {
  if (!isoDate) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(isoDate));
}

/**
 * BillingView — uses the existing useTeam() hook which calls /teams/me.
 * That endpoint already returns plan, usage.meetingsUsed, usage.meetingsLimit,
 * usage.membersCount, usage.membersLimit, usage.billingCycleEnd, etc.
 * No separate billing API needed for Day 42.
 */
export function BillingView() {
  const { data: team, isLoading, isError } = useTeam();
  const user = useAuthStore((s) => s.user);
  const [compareSheetOpen, setCompareSheetOpen] = useState(false);

  // Section label — Plus Jakarta Sans 13/600, uppercase, +0.04em (plan §1)
  const SectionLabel = ({ id, children }: { id?: string; children: React.ReactNode }) => (
    <h3
      id={id}
      className="font-heading font-semibold uppercase text-muted-foreground/60 leading-[20px] tracking-[0.04em]"
      style={{ fontSize: "13px" }}
    >
      {children}
    </h3>
  );

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="rounded-[var(--radius-lg)] border border-border p-5 space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-4 w-36" />
          <div className="flex items-center gap-4 pt-1">
            <Skeleton className="h-9 w-32 rounded-md" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
        <Separator />
        <div className="space-y-3">
          <Skeleton className="h-4 w-32" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
              <Skeleton className="h-1 w-full rounded-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (isError || !team) {
    return (
      <p className="text-[13px] font-sans text-muted-foreground/60 py-4">
        Couldn't load billing information. Please refresh the page.
      </p>
    );
  }

  const planId = normalizePlan(team.plan);
  const planName = PLAN_DISPLAY_NAMES[planId] ?? team.plan;
  const priceCents = PLAN_PRICES[team.plan] ?? 0;
  const priceDisplay = priceCents === -1 ? "Custom" : formatPrice(priceCents);
  const renewalDate = formatRenewalDate(team.usage.billingCycleEnd);
  const { meetingsUsed, meetingsLimit, membersCount, membersLimit } = team.usage;

  return (
    <>
      <div className="space-y-6">
        {/* ── CurrentPlanCard — the ONE Card on this page (plan §3) ── */}
        <Card className="border border-border bg-card rounded-[var(--radius-lg)] shadow-none">
          <CardContent className="p-5">
            {/* Row 1: Plan name + status badge */}
            <div className="flex items-center justify-between gap-3">
              <h2
                className="font-heading font-semibold leading-[24px] tracking-[-0.01em] text-foreground"
                style={{ fontSize: "18px" }}
              >
                {planName}
              </h2>
              {/* Active badge — rendered the same way as integrations badges */}
              <span className="inline-flex items-center justify-center text-[11px] font-sans font-medium uppercase tracking-[0.02em] text-muted-foreground/80 border border-muted/30 px-2 py-0.5 h-5 rounded-md select-none">
                Active
              </span>
            </div>

            {/* Row 2: Price */}
            <div className="flex items-baseline gap-1 mt-1">
              <span
                className="font-[family-name:var(--font-poppins)] font-medium tabular-nums text-foreground leading-[28px]"
                style={{ fontSize: "24px" }}
              >
                {priceDisplay}
              </span>
              {priceCents > 0 && priceCents !== -1 && (
                <span
                  className="font-sans font-normal text-muted-foreground/60 leading-[20px]"
                  style={{ fontSize: "13px" }}
                >
                  /mo
                </span>
              )}
            </div>

            {/* Row 3: Renewal date */}
            {renewalDate && (
              <p
                className="font-sans font-normal text-muted-foreground leading-[16px] mt-1"
                style={{ fontSize: "12px" }}
              >
                Renews on {renewalDate}
              </p>
            )}

            {/* Row 4: CTAs */}
            <div className="flex items-center gap-4 mt-4">
              <BillingPortalButton />
              <button
                type="button"
                onClick={() => setCompareSheetOpen(true)}
                className={cn(
                  "text-[13px] font-sans font-medium text-muted-foreground",
                  "hover:text-foreground transition-colors duration-100",
                  "focus:outline-none focus-visible:underline"
                )}
              >
                Compare plans →
              </button>
            </div>
          </CardContent>
        </Card>

        <Separator />

        {/* ── Usage this period ── */}
        <section aria-labelledby="usage-label">
          <SectionLabel id="usage-label">Usage this period</SectionLabel>
          <div className="mt-3 space-y-3">
            {/* Meetings */}
            <UsageProgressRow
              label="Meetings"
              used={meetingsUsed}
              limit={meetingsLimit === -1 ? null : meetingsLimit}
              upgradeUrl="/settings/billing"
            />
            {/* Members */}
            <UsageProgressRow
              label="Members"
              used={membersCount}
              limit={membersLimit === -1 ? null : membersLimit}
              upgradeUrl="/settings/billing"
            />
            {/* Storage — shown as static for now since backend tracks GB separately */}
            <UsageProgressRow
              label="Storage"
              used={0}
              limit={null}
              upgradeUrl="/settings/billing"
            />
          </div>
        </section>

        <Separator />

        {/* ── Invoices — placeholder until Stripe invoices API is wired ── */}
        <section aria-labelledby="invoices-label">
          <SectionLabel id="invoices-label">Invoices</SectionLabel>
          <div className="mt-3 rounded-lg border border-border/50 overflow-hidden">
            <div className="py-10 text-center text-[13px] font-sans font-normal text-muted-foreground/60 select-none">
              No invoices yet — they'll appear here after your first billing cycle.
            </div>
          </div>
        </section>
      </div>

      {/* Plan comparison sheet */}
      <PlanComparisonSheet
        open={compareSheetOpen}
        onClose={() => setCompareSheetOpen(false)}
        currentPlanId={planId}
      />
    </>
  );
}
