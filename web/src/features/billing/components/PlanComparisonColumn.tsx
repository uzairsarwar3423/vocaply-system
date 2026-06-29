"use client";

import React from "react";
import { Check, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PlanId, PlanFeatureValue } from "../types";
import { PLAN_DISPLAY_NAMES, getPlanPricing, formatPlanPrice } from "../data/plan-features.config";
import { useCheckout } from "../hooks/useCheckout";
import { cn } from "@/lib/utils";

interface PlanComparisonColumnProps {
  planId: PlanId;
  /** Value for each feature row, in order */
  featureValues: PlanFeatureValue[];
  isCurrentPlan: boolean;
  onCancelPlan?: () => void;
}

function renderFeatureValue(value: PlanFeatureValue): React.ReactNode {
  if (value === true) return <Check className="h-3.5 w-3.5 text-foreground mx-auto" aria-label="Included" />;
  if (value === false) return <Minus className="h-3.5 w-3.5 text-muted-foreground/30 mx-auto" aria-label="Not included" />;
  if (typeof value === "string" || typeof value === "number") {
    return (
      <span className="text-[13px] font-sans font-normal text-muted-foreground">
        {value}
      </span>
    );
  }
  // Object form: { label, note? }
  const obj = value as { label: string; note?: string };
  return (
    <span
      className="text-[13px] font-sans font-normal text-muted-foreground"
      title={obj.note}
    >
      {obj.label}
    </span>
  );
}

/**
 * PlanComparisonColumn — single plan's column in PlanComparisonTable (plan §6.6).
 * Handles: current-plan column highlight (static, always-on — not animated),
 * footer CTA (Select → useCheckout, same label-swap + disable as portal button),
 * and cancel plan link at column footer.
 */
export function PlanComparisonColumn({
  planId,
  featureValues,
  isCurrentPlan,
  onCancelPlan,
}: PlanComparisonColumnProps) {
  const pricing = getPlanPricing(planId);
  const { startCheckout, checkoutState, checkoutError } = useCheckout();

  const isRedirecting = checkoutState === "redirecting";
  const priceDisplay = pricing ? formatPlanPrice(pricing.pricePerMonth, pricing.currency) : "—";

  return (
    <div
      className={cn(
        "flex flex-col",
        // Current-plan column highlight — static, not animated (plan §4.7)
        isCurrentPlan && "bg-muted/40 rounded-lg"
      )}
    >
      {/* Column header */}
      <div className="px-3 py-3 text-center border-b border-border/50">
        <p className="text-[12px] font-sans font-medium uppercase tracking-[0.04em] text-muted-foreground/60">
          {PLAN_DISPLAY_NAMES[planId]}
        </p>
        {/* Plan price — Poppins, tabular-nums */}
        <p
          className="font-[family-name:var(--font-poppins)] font-medium tabular-nums text-foreground leading-[24px] mt-0.5"
          style={{ fontSize: "16px" }}
        >
          {priceDisplay}
          {pricing?.pricePerMonth !== null && pricing?.pricePerMonth !== 0 && (
            <span className="text-[11px] font-sans font-normal text-muted-foreground/60 ml-0.5">/mo</span>
          )}
        </p>
        {isCurrentPlan && (
          <span className="mt-1 inline-block text-[11px] font-sans font-medium text-muted-foreground/70">
            Current plan
          </span>
        )}
      </div>

      {/* Feature values */}
      <div className="divide-y divide-border/30 flex-1">
        {featureValues.map((value, i) => (
          <div key={i} className="px-3 py-3 flex items-center justify-center min-h-[44px]">
            {renderFeatureValue(value)}
          </div>
        ))}
      </div>

      {/* Footer CTA */}
      <div className="px-3 pt-3 pb-4 text-center space-y-2">
        {isCurrentPlan ? (
          <div className="space-y-2">
            <p className="text-[12px] font-sans font-normal text-muted-foreground/60">
              Your current plan
            </p>
            {/* Cancel plan link — quiet, deliberate, bottom of comparison column (plan §4.8) */}
            {onCancelPlan && (
              <button
                type="button"
                onClick={onCancelPlan}
                className={cn(
                  "text-[12px] font-sans font-normal text-muted-foreground/50",
                  "hover:text-muted-foreground transition-colors duration-100",
                  "focus:outline-none focus-visible:underline"
                )}
              >
                Cancel plan
              </button>
            )}
          </div>
        ) : planId === "enterprise" ? (
          <a
            href="mailto:enterprise@vocaply.com"
            className="text-[13px] font-sans font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Contact sales →
          </a>
        ) : (
          <div className="space-y-1">
            <Button
              size="sm"
              variant={isCurrentPlan ? "outline" : "default"}
              onClick={() => {
                if (pricing?.stripePriceId) {
                  startCheckout(pricing.stripePriceId);
                }
              }}
              disabled={isRedirecting || !pricing?.stripePriceId}
              className="w-full text-[13px] font-sans h-8 transition-all duration-[120ms]"
            >
              {isRedirecting ? "Redirecting…" : "Select"}
            </Button>
            {checkoutError && (
              <p className="text-[11px] font-sans text-destructive">{checkoutError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
