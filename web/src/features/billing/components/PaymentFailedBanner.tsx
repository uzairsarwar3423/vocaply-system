"use client";

import React, { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { TopBanner } from "@/shared/components/feedback/TopBanner";
import { useBillingPortal } from "../hooks/useBillingPortal";
import { cn } from "@/lib/utils";

interface PaymentFailedBannerProps {
  /** Controlled — visibility is determined by subscription.status === 'past_due' */
  visible: boolean;
}

/**
 * PaymentFailedBanner — consumes TopBanner shell (plan §4.9, §6.8):
 * - 'attention' variant (amber/warning bg).
 * - Has a close (×) affordance — payment-failed can be acknowledged-and-deferred.
 * - Reappears on next session load until subscription status actually changes
 *   (never permanently suppressed by a local dismiss flag — plan §4.9).
 * - "Update payment method" action reuses useBillingPortal — NOT a duplicated mutation.
 */
export function PaymentFailedBanner({ visible }: PaymentFailedBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const { openPortal, buttonState } = useBillingPortal();

  // Session-level dismiss only — reappears on next load (per plan §4.9)
  if (!visible || dismissed) return null;

  return (
    <TopBanner
      variant="attention"
      icon={<AlertTriangle className="h-3.5 w-3.5" />}
      onDismiss={() => setDismissed(true)}
      className="mb-0"
    >
      <span className="text-amber-900 dark:text-amber-200">
        Payment failed — your subscription is past due.{" "}
        <button
          type="button"
          onClick={openPortal}
          disabled={buttonState === "redirecting"}
          className={cn(
            "font-medium underline underline-offset-2",
            "hover:opacity-80 transition-opacity duration-100",
            "focus:outline-none focus-visible:no-underline focus-visible:ring-1 focus-visible:ring-current rounded-sm",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {buttonState === "redirecting" ? "Redirecting…" : "Update payment method →"}
        </button>
      </span>
    </TopBanner>
  );
}
