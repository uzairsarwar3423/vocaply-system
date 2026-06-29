"use client";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * AnalyticsDashboardSkeleton — Day 45 §7
 *
 * Plain bordered boxes at each chart's exact rendered aspect ratio.
 * NO fake bar/line shapes inside — anti-illustration stance applies to loading states.
 * Charts are simple bordered div placeholders; no SVG fakes.
 * Dimension-matched to the real AnalyticsDashboard layout for zero CLS.
 *
 * Individual chart wrappers are designed to accept WidgetErrorFallback
 * isolation in the real component (one chart failing ≠ whole page failing).
 */
export function AnalyticsDashboardSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in-0 duration-150">
      {/* KPI metric cards row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-border/40 bg-surface/20 p-4 space-y-2.5"
          >
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>

      {/* Chart row 1: primary (3/5) + secondary (2/5) */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {/* Primary chart skeleton */}
        <div className="md:col-span-3 rounded-xl border border-border/40 bg-surface/20 p-4">
          <div className="flex items-center justify-between mb-4">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-6 w-24 rounded-md" />
          </div>
          {/* Plain bordered box — exact aspect ratio 16:9-ish for a bar/line chart */}
          <div
            className="w-full rounded-lg border border-border/30 bg-muted/10"
            style={{ aspectRatio: "16/7" }}
          />
        </div>

        {/* Secondary chart skeleton */}
        <div className="md:col-span-2 rounded-xl border border-border/40 bg-surface/20 p-4">
          <Skeleton className="h-4 w-28 mb-4" />
          {/* Plain bordered box — approximate donut/pie chart aspect */}
          <div
            className="w-full rounded-lg border border-border/30 bg-muted/10"
            style={{ aspectRatio: "1/1", maxHeight: "180px" }}
          />
        </div>
      </div>

      {/* Chart row 2: full-width trend chart */}
      <div className="rounded-xl border border-border/40 bg-surface/20 p-4">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-4 w-44" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-12 rounded-md" />
            <Skeleton className="h-6 w-12 rounded-md" />
            <Skeleton className="h-6 w-12 rounded-md" />
          </div>
        </div>
        <div
          className="w-full rounded-lg border border-border/30 bg-muted/10"
          style={{ aspectRatio: "16/5" }}
        />
      </div>

      {/* Bottom data table */}
      <div className="rounded-xl border border-border/40 overflow-hidden">
        {/* Table header */}
        <div className="h-9 border-b border-border/40 bg-muted/20 flex items-center px-4 gap-8">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-14 ml-auto" />
        </div>
        {/* Table rows */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-8 px-4 py-3 border-b border-border/30 last:border-b-0"
          >
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-12 tabular-nums" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-5 w-14 rounded-full ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
