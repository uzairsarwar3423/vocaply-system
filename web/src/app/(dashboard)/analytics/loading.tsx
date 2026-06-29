import { Skeleton } from "@/components/ui/skeleton";

/**
 * Analytics loading skeleton — Day 45 §7
 *
 * Plain bordered boxes at each chart's exact aspect ratio.
 * NO fake bar/line shapes inside — anti-illustration stance applies to loading states.
 * Zero CLS: skeleton dimensions match real content bounding boxes.
 */
export default function AnalyticsLoading() {
  return (
    <div className="p-6 space-y-6">
      {/* Page header skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* KPI row: 4 metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border/40 bg-surface/30 p-4 space-y-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>

      {/* Chart row 1: 2 charts (60/40 split) */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {/* Primary chart — 60% */}
        <div className="md:col-span-3 rounded-xl border border-border/40 bg-surface/30 p-4">
          <Skeleton className="h-4 w-32 mb-4" />
          {/* Plain bordered box — exact aspect ratio, no fake shapes inside */}
          <div className="h-[220px] rounded-lg border border-border/30 bg-muted/10" />
        </div>
        {/* Secondary chart — 40% */}
        <div className="md:col-span-2 rounded-xl border border-border/40 bg-surface/30 p-4">
          <Skeleton className="h-4 w-28 mb-4" />
          <div className="h-[220px] rounded-lg border border-border/30 bg-muted/10" />
        </div>
      </div>

      {/* Chart row 2: full-width */}
      <div className="rounded-xl border border-border/40 bg-surface/30 p-4">
        <Skeleton className="h-4 w-40 mb-4" />
        <div className="h-[200px] rounded-lg border border-border/30 bg-muted/10" />
      </div>

      {/* Bottom: data table skeleton */}
      <div className="rounded-xl border border-border/40 overflow-hidden">
        <div className="h-9 border-b border-border/40 bg-muted/20 flex items-center px-4 gap-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-border/30 last:border-b-0">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-14 rounded-full ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
