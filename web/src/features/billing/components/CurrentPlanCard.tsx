"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { PlanStatusBadge } from "./PlanStatusBadge";
import { BillingPortalButton } from "./BillingPortalButton";
import type { Subscription } from "../types";
import { PLAN_DISPLAY_NAMES, formatPlanPrice } from "../data/plan-features.config";
import { cn } from "@/lib/utils";

interface CurrentPlanCardProps {
  subscription: Subscription;
  onCompareClick: () => void;
}

function formatRenewalDate(isoDate: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZoneName: undefined,
    // Uses the user's resolved timezone automatically via `undefined` locale
  }).format(new Date(isoDate));
}

/**
 * CurrentPlanCard — the ONE Card-class element on /settings/billing (plan §3).
 * Anatomy: plan name (Plus Jakarta Sans 18/600) + badge | price (Poppins 24/500) | renewal date | CTA row.
 * No shadow — this product's Cards are flat, bordered, never elevated.
 */
export function CurrentPlanCard({ subscription, onCompareClick }: CurrentPlanCardProps) {
  const planName = PLAN_DISPLAY_NAMES[subscription.planId] ?? subscription.planId;
  const priceDisplay = formatPlanPrice(subscription.pricePerMonth, subscription.currency);
  const renewalDate = formatRenewalDate(subscription.currentPeriodEnd);

  return (
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
          <PlanStatusBadge
            status={subscription.status}
            cancelAtPeriodEnd={subscription.cancelAtPeriodEnd}
          />
        </div>

        {/* Row 2: Price */}
        <div className="flex items-baseline gap-1 mt-1">
          <span
            className="font-[family-name:var(--font-poppins)] font-medium tabular-nums text-foreground leading-[28px]"
            style={{ fontSize: "24px" }}
          >
            {priceDisplay}
          </span>
          {subscription.pricePerMonth !== null && subscription.pricePerMonth > 0 && (
            <span
              className="font-sans font-normal text-muted-foreground/60 leading-[20px]"
              style={{ fontSize: "13px" }}
            >
              /mo
            </span>
          )}
        </div>

        {/* Row 3: Renewal date */}
        <p
          className="font-sans font-normal text-muted-foreground leading-[16px] mt-1"
          style={{ fontSize: "12px" }}
        >
          {subscription.cancelAtPeriodEnd
            ? `Cancels on ${renewalDate}`
            : subscription.status === "trialing"
            ? `Trial ends ${renewalDate}`
            : `Renews on ${renewalDate}`}
        </p>

        {/* Row 4: CTAs */}
        <div className="flex items-center gap-4 mt-4">
          <BillingPortalButton />
          <button
            type="button"
            onClick={onCompareClick}
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
  );
}
