"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import type { SubscriptionStatus } from "../types";

/** Plan status badge — four states, identical badge chrome for all (plan §5 + §4.8) */
export type PlanBadgeStatus = "active" | "trialing" | "past_due" | "cancelling";

interface PlanStatusBadgeProps {
  status: SubscriptionStatus;
  cancelAtPeriodEnd: boolean;
}

function resolveBadgeStatus(
  status: SubscriptionStatus,
  cancelAtPeriodEnd: boolean
): PlanBadgeStatus {
  // "Cancelling" overrides "Active" the instant cancel_at_period_end is true
  if (cancelAtPeriodEnd) return "cancelling";
  if (status === "trialing") return "trialing";
  if (status === "past_due" || status === "unpaid") return "past_due";
  return "active";
}

const BADGE_LABELS: Record<PlanBadgeStatus, string> = {
  active: "Active",
  trialing: "Trialing",
  past_due: "Past due",
  cancelling: "Cancelling",
};

export function PlanStatusBadge({ status, cancelAtPeriodEnd }: PlanStatusBadgeProps) {
  const badgeStatus = resolveBadgeStatus(status, cancelAtPeriodEnd);

  return (
    <Badge
      variant="outline"
      className="text-[11px] font-sans font-medium uppercase tracking-[0.02em] text-muted-foreground/80 border-muted/30 px-2 py-0.5 h-5 rounded-md select-none inline-flex items-center justify-center"
    >
      {BADGE_LABELS[badgeStatus]}
    </Badge>
  );
}
