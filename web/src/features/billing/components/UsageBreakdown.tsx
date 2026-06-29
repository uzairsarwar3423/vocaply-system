"use client";

import React from "react";
import { UsageProgressRow } from "./UsageProgressRow";
import type { UsageSummary } from "../types";

interface UsageBreakdownProps {
  usage: UsageSummary;
}

/**
 * UsageBreakdown — renders UsageProgressRow × N metrics (plan §3).
 * Row vertical rhythm: 12px gap between rows (space-y-3).
 * Storage row uses "GB" unit to trigger formatted byte display.
 */
export function UsageBreakdown({ usage }: UsageBreakdownProps) {
  return (
    <div className="space-y-3">
      {usage.metrics.map((metric) => (
        <UsageProgressRow
          key={metric.resource}
          label={metric.label}
          used={metric.used}
          limit={metric.limit}
          unit={metric.unit}
          upgradeUrl="/settings/billing"
        />
      ))}
    </div>
  );
}
