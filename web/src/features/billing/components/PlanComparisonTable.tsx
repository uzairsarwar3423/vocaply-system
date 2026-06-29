"use client";

import React, { useState } from "react";
import { PLAN_FEATURES, PLAN_IDS_ORDERED } from "../data/plan-features.config";
import { PlanComparisonColumn } from "./PlanComparisonColumn";
import type { PlanId } from "../types";
import { cn } from "@/lib/utils";

interface PlanComparisonTableProps {
  currentPlanId: PlanId;
  onCancelPlan: () => void;
}

/**
 * PlanComparisonTable — reads plan-features.config.ts and renders the full grid.
 * (plan §6.6, §4.7)
 *
 * Row hover: hovering a FEATURE ROW highlights it across all 5 columns simultaneously
 * (subtle background, 100ms linear) — the one piece of cross-column affordance that
 * genuinely helps comparison-table scanning.
 *
 * Uses real semantic layout (not div-grids pretending to be a table).
 * But note: a plain div-grid is used here intentionally because the Collapsible-row
 * composition needed for this dense table works cleaner with grid than with <table> semantics
 * when nested inside a Sheet. The aria attributes provide correct screen reader semantics.
 */
export function PlanComparisonTable({ currentPlanId, onCancelPlan }: PlanComparisonTableProps) {
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  // Group features by category for rendering
  const categories = Array.from(
    new Map(PLAN_FEATURES.map((f) => [f.category || "General", true]))
  ).map(([cat]) => cat);

  const PLANS = PLAN_IDS_ORDERED;

  return (
    <div className="overflow-x-auto -mx-1">
      {/* Feature-name column + 5 plan columns = 6 columns total */}
      <div
        className="min-w-[640px]"
        role="table"
        aria-label="Plan comparison"
      >
        {/* Header row */}
        <div className="grid grid-cols-[180px_repeat(5,1fr)] border-b border-border/50" role="row">
          <div className="px-3 py-3" role="columnheader" aria-label="Feature" />
          {PLANS.map((planId) => (
            <PlanComparisonColumn
              key={planId}
              planId={planId}
              featureValues={PLAN_FEATURES.map((f) => f[planId])}
              isCurrentPlan={planId === currentPlanId}
              onCancelPlan={planId === currentPlanId ? onCancelPlan : undefined}
            />
          ))}
        </div>

        {/* Feature rows — grouped by category */}
        {categories.map((category) => {
          const rows = PLAN_FEATURES.filter((f) => (f.category || "General") === category);
          return (
            <div key={category} role="rowgroup">
              {/* Category label */}
              <div
                className="grid grid-cols-[180px_repeat(5,1fr)] bg-muted/20 border-b border-border/30"
                role="row"
              >
                <div className="px-3 py-2 col-span-6">
                  <span
                    className="text-[11px] font-sans font-medium uppercase tracking-[0.06em] text-muted-foreground/50"
                  >
                    {category}
                  </span>
                </div>
              </div>

              {rows.map((row, rowIdx) => {
                const globalRowIdx = PLAN_FEATURES.indexOf(row);
                return (
                  <div
                    key={row.feature}
                    role="row"
                    className={cn(
                      "grid grid-cols-[180px_repeat(5,1fr)] border-b border-border/20 last:border-0",
                      "transition-colors duration-100 ease-linear",
                      hoveredRow === globalRowIdx ? "bg-muted/30" : "bg-transparent"
                    )}
                    onMouseEnter={() => setHoveredRow(globalRowIdx)}
                    onMouseLeave={() => setHoveredRow(null)}
                  >
                    {/* Feature name cell */}
                    <div
                      className="px-3 py-3 flex items-center"
                      role="rowheader"
                    >
                      <span className="text-[13px] font-sans font-normal text-foreground leading-[20px]">
                        {row.feature}
                      </span>
                    </div>

                    {/* Plan value cells — re-render value per plan */}
                    {PLANS.map((planId) => {
                      const val = row[planId];
                      return (
                        <div
                          key={planId}
                          role="cell"
                          className={cn(
                            "px-3 py-3 flex items-center justify-center",
                            planId === currentPlanId && "bg-muted/20"
                          )}
                        >
                          {val === true ? (
                            <span className="text-foreground text-[13px]">✓</span>
                          ) : val === false ? (
                            <span className="text-muted-foreground/25 text-[13px]">—</span>
                          ) : (
                            <span className="text-[13px] font-sans font-normal text-muted-foreground text-center">
                              {typeof val === "object" && val !== null
                                ? (val as { label: string }).label
                                : String(val)}
                            </span>
                          )}
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
  );
}
