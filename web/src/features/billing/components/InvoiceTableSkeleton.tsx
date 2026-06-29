"use client";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * InvoiceTableSkeleton — Day 45 §7
 *
 * Matches InvoiceTable's exact column structure:
 * [chevron 20px] [date+description 1fr] [amount auto] [status badge auto] [download auto]
 * See InvoiceRow.tsx grid-cols-[20px_1fr_auto_auto_auto] — exact parity.
 *
 * Dimension-matched for zero CLS: same row height and column widths as real InvoiceRow.
 */
export function InvoiceTableSkeleton() {
  return (
    <div
      className="rounded-xl border border-border/40 overflow-hidden animate-in fade-in-0 duration-150"
      aria-label="Loading invoices"
      aria-busy="true"
    >
      {/* Table header row */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40 bg-muted/20">
        {/* Chevron col */}
        <div className="w-5 shrink-0" />
        {/* Description col */}
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3 w-28" />
        </div>
        {/* Amount col */}
        <Skeleton className="h-3 w-16 tabular-nums" />
        {/* Status col */}
        <Skeleton className="h-5 w-14 rounded-full" />
        {/* Download col */}
        <Skeleton className="h-6 w-7 rounded-md" />
      </div>

      {/* Invoice rows — 6 rows matching a typical first-page load */}
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="grid items-center gap-3 px-4 py-3 border-b border-border/30 last:border-b-0"
          style={{ gridTemplateColumns: "20px 1fr auto auto auto" }}
        >
          {/* Chevron placeholder */}
          <div className="w-3.5 h-3.5 rounded-sm bg-muted/20" />

          {/* Description + date */}
          <div className="min-w-0 space-y-1.5">
            <Skeleton className="h-[13px] w-3/4" />
            <Skeleton className="h-3 w-24" />
          </div>

          {/* Amount — tabular-nums Poppins in real component */}
          <Skeleton className="h-[13px] w-14 tabular-nums" />

          {/* Status badge */}
          <Skeleton className="h-5 w-14 rounded-full" />

          {/* Download button */}
          <Skeleton className="h-6 w-7 rounded-md" />
        </div>
      ))}
    </div>
  );
}
