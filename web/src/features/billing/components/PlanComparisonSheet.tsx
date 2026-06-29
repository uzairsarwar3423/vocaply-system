"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Minus, X, Zap, ArrowRight } from "lucide-react";
import { CancelPlanAlert } from "@/features/billing/components/CancelPlanAlert";
import { useCheckout } from "../hooks/useCheckout";
import type { PlanId, PlanFeatureValue } from "../types";
import {
  PLAN_FEATURES,
  PLAN_IDS_ORDERED,
  PLAN_DISPLAY_NAMES,
  getPlanPricing,
  formatPlanPrice,
} from "../data/plan-features.config";
import { cn } from "@/lib/utils";

// ── Plan accent colors (one per tier, used only in column headers) ─────────────
const PLAN_ACCENTS: Record<PlanId, { badge: string; btn: string; ring: string }> = {
  free: {
    badge: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
    btn: "bg-zinc-900 hover:bg-zinc-700 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200",
    ring: "ring-zinc-200 dark:ring-zinc-700",
  },
  starter: {
    badge: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
    btn: "bg-blue-600 hover:bg-blue-700 text-white",
    ring: "ring-blue-100 dark:ring-blue-900",
  },
  growth: {
    badge: "bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-400",
    btn: "bg-violet-600 hover:bg-violet-700 text-white",
    ring: "ring-violet-100 dark:ring-violet-900",
  },
  business: {
    badge: "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400",
    btn: "bg-amber-500 hover:bg-amber-600 text-white",
    ring: "ring-amber-100 dark:ring-amber-900",
  },
  enterprise: {
    badge: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400",
    btn: "bg-emerald-600 hover:bg-emerald-700 text-white",
    ring: "ring-emerald-100 dark:ring-emerald-900",
  },
};

// ── Feature value renderer ────────────────────────────────────────────────────
function renderValue(value: PlanFeatureValue): React.ReactNode {
  if (value === true)
    return (
      <Check
        className="h-4 w-4 text-emerald-500 mx-auto"
        strokeWidth={2.5}
        aria-label="Included"
      />
    );
  if (value === false)
    return (
      <Minus
        className="h-3.5 w-3.5 text-foreground/15 mx-auto"
        strokeWidth={2}
        aria-label="Not included"
      />
    );
  const label =
    typeof value === "object" && value !== null
      ? (value as { label: string }).label
      : String(value);
  const isUnlimited = label === "Unlimited";
  return (
    <span
      className={cn(
        "text-[12px] font-sans font-medium leading-[18px] text-center",
        isUnlimited ? "text-emerald-600 dark:text-emerald-400" : "text-foreground/70"
      )}
    >
      {label}
    </span>
  );
}

// ── PlanColumnHeader ──────────────────────────────────────────────────────────
interface PlanColumnHeaderProps {
  planId: PlanId;
  isCurrentPlan: boolean;
  onCancelPlan?: () => void;
}

function PlanColumnHeader({ planId, isCurrentPlan, onCancelPlan }: PlanColumnHeaderProps) {
  const [hovered, setHovered] = useState(false);
  const pricing = getPlanPricing(planId);
  const accent = PLAN_ACCENTS[planId];
  const { startCheckout, checkoutState } = useCheckout();
  const isRedirecting = checkoutState === "redirecting";
  const priceDisplay = pricing ? formatPlanPrice(pricing.pricePerMonth, pricing.currency) : "—";

  return (
    <div
      className={cn(
        "flex flex-col items-center px-2 pt-4 pb-3 relative",
        "transition-all duration-200 ease-out rounded-xl",
        isCurrentPlan
          ? "bg-foreground/[0.04] ring-1 ring-foreground/10"
          : hovered
          ? "bg-foreground/[0.02]"
          : ""
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Current plan ribbon */}
      {isCurrentPlan && (
        <div className="absolute -top-px left-1/2 -translate-x-1/2">
          <div className="bg-foreground text-background text-[9px] font-sans font-semibold uppercase tracking-[0.08em] px-2 py-0.5 rounded-b-md select-none">
            Current
          </div>
        </div>
      )}

      {/* Plan name badge */}
      <span
        className={cn(
          "text-[10px] font-sans font-semibold uppercase tracking-[0.08em] px-2 py-0.5 rounded-full mb-2 mt-2 select-none",
          accent.badge
        )}
      >
        {PLAN_DISPLAY_NAMES[planId]}
      </span>

      {/* Price — Poppins tabular-nums */}
      <div className="flex items-baseline gap-0.5 mb-1">
        <span
          className="font-[family-name:var(--font-poppins)] font-semibold tabular-nums text-foreground leading-none"
          style={{ fontSize: "20px" }}
        >
          {priceDisplay}
        </span>
        {pricing?.pricePerMonth !== null &&
          pricing?.pricePerMonth !== 0 &&
          pricing?.pricePerMonth !== -1 && (
            <span className="text-[11px] font-sans text-foreground/40 leading-none">/mo</span>
          )}
      </div>

      {/* CTA */}
      <div className="w-full mt-2">
        {isCurrentPlan ? (
          <div className="flex flex-col items-center gap-1.5">
            <div
              className={cn(
                "w-full flex items-center justify-center gap-1 h-7 rounded-lg text-[11px] font-sans font-medium",
                "border border-foreground/15 text-foreground/50 select-none"
              )}
            >
              Current plan
            </div>
            {onCancelPlan && (
              <button
                type="button"
                onClick={onCancelPlan}
                className="text-[10px] font-sans text-foreground/30 hover:text-destructive transition-colors duration-150 focus:outline-none focus-visible:underline"
              >
                Cancel plan
              </button>
            )}
          </div>
        ) : planId === "enterprise" ? (
          <a
            href="mailto:enterprise@vocaply.com"
            className={cn(
              "w-full flex items-center justify-center gap-1 h-7 rounded-lg text-[11px] font-sans font-medium",
              "transition-all duration-150 active:scale-[0.98]",
              accent.btn
            )}
          >
            Contact sales
          </a>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (pricing?.stripePriceId) startCheckout(pricing.stripePriceId);
            }}
            disabled={isRedirecting || !pricing?.stripePriceId}
            className={cn(
              "w-full flex items-center justify-center gap-1 h-7 rounded-lg text-[11px] font-sans font-medium",
              "transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed",
              accent.btn,
              // Scale up on hover only when not current
              hovered && !isRedirecting && "scale-[1.02]"
            )}
          >
            {isRedirecting ? "Redirecting…" : (
              <>
                Select <ArrowRight className="h-3 w-3 ml-0.5" />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Dialog ───────────────────────────────────────────────────────────────
interface PlanComparisonSheetProps {
  open: boolean;
  onClose: () => void;
  currentPlanId: PlanId;
}

export function PlanComparisonSheet({ open, onClose, currentPlanId }: PlanComparisonSheetProps) {
  const [cancelAlertOpen, setCancelAlertOpen] = useState(false);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  // Group features by category
  const categories = Array.from(
    new Map(PLAN_FEATURES.map((f) => [f.category || "General", true]))
  ).map(([cat]) => cat);

  const PLANS = PLAN_IDS_ORDERED;

  return (
    <>
      <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
        <DialogContent
          showCloseButton={false}
          className={cn(
            // Center in viewport
            "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
            // Size
            "w-[98vw] max-w-[98vw] sm:max-w-[96vw] md:max-w-[92vw] lg:max-w-[1440px] max-h-[90vh]",
            // Layout
            "flex flex-col p-0 gap-0 overflow-hidden",
            // White background, strong rounded, deep shadow
            "bg-white dark:bg-zinc-950",
            "rounded-2xl",
            "shadow-[0_24px_80px_-12px_rgba(0,0,0,0.22)]",
            // Remove default ring
            "ring-0 outline-none",
            // Entrance animation — zoom-in from center
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
            "duration-200"
          )}
          aria-describedby="compare-dialog-desc"
        >
          {/* ── Header ───────────────────────────────────────────────────── */}
          <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-black/[0.06] dark:border-white/[0.06] shrink-0">
            <div>
              {/* Plus Jakarta Sans heading per user request */}
              <h2
                className="font-[family-name:var(--font-jakarta)] font-semibold text-foreground tracking-[-0.02em] leading-[28px]"
                style={{ fontSize: "20px" }}
              >
                Compare plans
              </h2>
              <p
                id="compare-dialog-desc"
                className="text-[13px] font-sans font-normal text-foreground/50 mt-0.5 leading-[20px]"
              >
                Choose the right plan for your team. Upgrade or downgrade at any time.
              </p>
            </div>

            {/* Close button — top-right */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className={cn(
                "ml-4 mt-0.5 h-8 w-8 flex items-center justify-center rounded-lg shrink-0",
                "text-foreground/40 hover:text-foreground hover:bg-black/[0.06] dark:hover:bg-white/[0.06]",
                "transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
              )}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* ── Scrollable table area ────────────────────────────────────── */}
          <div className="flex-1 overflow-auto">
            <div className="min-w-[1300px] px-4 pb-6">

              {/* Column headers — sticky to top of scroll area */}
              <div className="sticky top-0 z-10 bg-white dark:bg-zinc-950 pt-4 pb-2">
                <div className="grid grid-cols-[160px_repeat(5,1fr)] gap-x-1">
                  {/* Feature label column header */}
                  <div className="px-2 py-2 flex items-end">
                    <span className="text-[11px] font-sans font-medium uppercase tracking-[0.06em] text-foreground/30">
                      Features
                    </span>
                  </div>

                  {/* Plan column headers */}
                  {PLANS.map((planId) => (
                    <PlanColumnHeader
                      key={planId}
                      planId={planId}
                      isCurrentPlan={planId === currentPlanId}
                      onCancelPlan={planId === currentPlanId ? () => setCancelAlertOpen(true) : undefined}
                    />
                  ))}
                </div>
                {/* Thin separator under headers */}
                <div className="mt-3 h-px bg-black/[0.06] dark:bg-white/[0.06]" />
              </div>

              {/* Feature rows — grouped by category */}
              {categories.map((category) => {
                const rows = PLAN_FEATURES.filter(
                  (f) => (f.category || "General") === category
                );
                return (
                  <div key={category}>
                    {/* Category label row */}
                    <div className="grid grid-cols-[160px_repeat(5,1fr)] gap-x-1 mt-3 mb-1">
                      <div className="col-span-6 px-2 py-1.5">
                        <span className="text-[10px] font-sans font-semibold uppercase tracking-[0.1em] text-foreground/30 select-none">
                          {category}
                        </span>
                      </div>
                    </div>

                    {/* Feature rows */}
                    {rows.map((row) => {
                      const globalIdx = PLAN_FEATURES.indexOf(row);
                      const isHovered = hoveredRow === globalIdx;
                      return (
                        <div
                          key={row.feature}
                          role="row"
                          className={cn(
                            "grid grid-cols-[160px_repeat(5,1fr)] gap-x-1 rounded-lg",
                            "transition-colors duration-100 ease-linear cursor-default",
                            isHovered
                              ? "bg-black/[0.03] dark:bg-white/[0.03]"
                              : "bg-transparent"
                          )}
                          onMouseEnter={() => setHoveredRow(globalIdx)}
                          onMouseLeave={() => setHoveredRow(null)}
                        >
                          {/* Feature name */}
                          <div className="px-2 py-2.5 flex items-center">
                            <span className="text-[12px] font-sans font-normal text-foreground/70 leading-[18px]">
                              {row.feature}
                            </span>
                          </div>

                          {/* Plan values */}
                          {PLANS.map((planId) => {
                            const val = row[planId];
                            return (
                              <div
                                key={planId}
                                role="cell"
                                className={cn(
                                  "px-2 py-2.5 flex items-center justify-center rounded-lg",
                                  // Current plan column tint — always on
                                  planId === currentPlanId &&
                                    "bg-foreground/[0.025] dark:bg-white/[0.025]"
                                )}
                              >
                                {renderValue(val)}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Footer ───────────────────────────────────────────────────── */}
          <div className="shrink-0 px-6 py-4 border-t border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between bg-white dark:bg-zinc-950 rounded-b-2xl">
            <p className="text-[12px] font-sans text-foreground/40">
              All plans include a 14-day free trial. No credit card required.
            </p>
            <button
              type="button"
              onClick={onClose}
              className={cn(
                "h-8 px-4 flex items-center rounded-lg",
                "text-[13px] font-sans font-medium text-foreground/60",
                "hover:bg-black/[0.05] dark:hover:bg-white/[0.05]",
                "transition-colors duration-150 focus:outline-none"
              )}
            >
              Close
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel plan confirmation alert */}
      <CancelPlanAlert
        open={cancelAlertOpen}
        planId={currentPlanId}
        onClose={() => setCancelAlertOpen(false)}
        onSuccess={() => {
          setCancelAlertOpen(false);
          onClose();
        }}
      />
    </>
  );
}
