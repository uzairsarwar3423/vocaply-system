"use client";

import React, { useRef, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { UsageThresholdLink } from "./UsageThresholdLink";

interface UsageProgressRowProps {
  label: string;
  used: number;
  limit: number | null; // null = unlimited
  unit?: string;
  /** Threshold ratio to show "Upgrade →" link. Default 0.9 (90%). Prop, not hardcoded (plan §6.2) */
  threshold?: number;
  upgradeUrl?: string;
}

function formatValue(value: number, unit?: string): string {
  if (unit === "GB") {
    return `${value.toFixed(1)} GB`;
  }
  return String(value);
}

/**
 * UsageProgressRow — exact anatomy from plan §3:
 *   grid-template-columns: 1fr auto; gap 8px for the label/fraction line
 *   Progress bar: 4px height, full-width beneath
 *   Row vertical rhythm: 12px between rows
 *
 * Micro-interactions (plan §4.1, §4.2, §4.3):
 * - Fill-on-mount: 0→value in 280ms ease-out, ONCE per mount (hasAnimatedOnce ref).
 *   Gated by ref — a background TanStack Query refetch will NOT replay the animation.
 * - Unlimited rows: static 100% bar, NO fill animation (animating "filling up to unlimited"
 *   is a logical non-sequitur per plan §4.3).
 * - 90%+ threshold: "Upgrade →" link fades in, slot always reserved (no layout shift).
 */
export function UsageProgressRow({
  label,
  used,
  limit,
  unit,
  threshold = 0.9,
  upgradeUrl,
}: UsageProgressRowProps) {
  const isUnlimited = limit === null;
  const ratio = isUnlimited ? 1 : limit === 0 ? 0 : used / limit;
  const isAtThreshold = !isUnlimited && ratio >= threshold;

  // hasAnimatedOnce ref — guards the fill animation from replaying on refetch
  const hasAnimatedOnce = useRef(false);
  const [barWidth, setBarWidth] = useState<string>(
    isUnlimited ? "100%" : "0%"
  );

  useEffect(() => {
    if (isUnlimited) return; // No animation for unlimited rows (plan §4.3)
    if (hasAnimatedOnce.current) return;

    // Trigger animation on next frame
    const rafId = requestAnimationFrame(() => {
      setBarWidth(`${Math.min(ratio * 100, 100).toFixed(2)}%`);
      hasAnimatedOnce.current = true;
    });

    return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps: intentional — fires once on mount, never on re-render

  const fractionText = isUnlimited
    ? "Unlimited"
    : `${formatValue(used, unit)} / ${formatValue(limit!, unit)}`;

  return (
    <div className="space-y-1.5">
      {/* Label row: label left, fraction + threshold link right */}
      <div className="grid grid-cols-[1fr_auto] items-center gap-2">
        <span
          className="font-sans font-medium text-foreground leading-[20px]"
          style={{ fontSize: "13px" }}
        >
          {label}
        </span>

        <div className="flex items-center gap-0">
          {/* Fraction — Poppins, tabular-nums (plan §1 type scale) */}
          <span
            className={cn(
              "font-[family-name:var(--font-poppins)] font-medium tabular-nums leading-[16px]",
              isUnlimited ? "text-muted-foreground/60" : "text-muted-foreground"
            )}
            style={{ fontSize: "12px" }}
            aria-label={`${label}: ${fractionText}`}
          >
            {fractionText}
          </span>

          {/* Threshold link — always in DOM, opacity-controlled for no layout shift */}
          <UsageThresholdLink visible={isAtThreshold} upgradeUrl={upgradeUrl} />
        </div>
      </div>

      {/* Progress bar — 4px height, identical to CommitmentRateBar (Day 37) */}
      <div
        className="w-full h-[4px] rounded-full bg-muted/40 overflow-hidden"
        role="progressbar"
        aria-valuenow={isUnlimited ? undefined : used}
        aria-valuemax={isUnlimited ? undefined : limit ?? undefined}
        aria-label={`${label} usage: ${fractionText}`}
      >
        <div
          className="h-full rounded-full bg-foreground/80 origin-left"
          style={{
            width: barWidth,
            // Transition only fires once — hasAnimatedOnce gates re-triggers
            transition: isUnlimited
              ? "none"
              : hasAnimatedOnce.current
              ? "none"
              : "width 280ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
      </div>
    </div>
  );
}
