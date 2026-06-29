import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';

/**
 * BillingSettingsPage loading.tsx — skeleton matching the exact layout of:
 * 1. CurrentPlanCard
 * 2. UsageBreakdown (3 rows)
 * 3. InvoiceTable (3 rows)
 * (plan §2 — "Skeleton matching CurrentPlanCard + UsageBreakdown + InvoiceTable exactly")
 *
 * Only shown on a genuine cold/slow fetch — RSC-hydrated data means this rarely appears.
 */
export default function BillingSettingsLoading() {
  return (
    <div className="max-w-[760px] space-y-6">
      {/* Page title skeleton */}
      <Skeleton className="h-7 w-20" />

      {/* CurrentPlanCard skeleton */}
      <div className="rounded-[var(--radius-lg)] border border-border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-4 w-40" />
        <div className="flex items-center gap-4 pt-1">
          <Skeleton className="h-9 w-32 rounded-md" />
          <Skeleton className="h-4 w-28" />
        </div>
      </div>

      <Separator />

      {/* Usage section skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-36" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex justify-between items-center">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-[4px] w-full rounded-full" />
          </div>
        ))}
      </div>

      <Separator />

      {/* Invoice table skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-20" />
        <div className="rounded-lg border border-border/50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-border/50">
            <div className="w-5" />
            <Skeleton className="h-3 w-16" />
            <div className="flex-1" />
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-12" />
            <div className="w-7" />
          </div>
          {/* Rows */}
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-3 border-b border-border/30 last:border-0"
            >
              <Skeleton className="h-3.5 w-3.5 rounded-sm" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-52" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-5 w-12 rounded-full" />
              <Skeleton className="h-7 w-7 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
