"use client";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * IntegrationsGridSkeleton — Day 45 §7
 *
 * Matches IntegrationsGrid's section layout:
 * - Header with connected count
 * - Two sections (team / personal), each a list of IntegrationRow cards
 * - Each row: [provider icon 24px] [name + description] [status badge] [action button]
 * Dimension-matched to the real IntegrationRow for zero CLS.
 */
export function IntegrationsGridSkeleton() {
  return (
    <div className="space-y-8 animate-in fade-in-0 duration-150" aria-busy="true">
      {/* Grid header */}
      <div className="space-y-2">
        <Skeleton className="h-6 w-52" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Section 1: Team integrations */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-44" />
        <div className="rounded-xl border border-border/40 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <IntegrationRowSkeleton key={i} isLast={i === 3} />
          ))}
        </div>
      </div>

      {/* Section 2: Personal calendar integrations */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-52" />
        <div className="rounded-xl border border-border/40 overflow-hidden">
          {Array.from({ length: 1 }).map((_, i) => (
            <IntegrationRowSkeleton key={i} isLast={true} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Single integration row skeleton — matches IntegrationRow's layout */
function IntegrationRowSkeleton({ isLast }: { isLast: boolean }) {
  return (
    <div
      className={`flex items-center justify-between px-4 py-3 ${
        !isLast ? "border-b border-border/30" : ""
      }`}
    >
      {/* Left: icon + name + description */}
      <div className="flex items-center gap-3">
        {/* Provider icon */}
        <Skeleton className="h-6 w-6 rounded-md shrink-0" />
        {/* Name + description */}
        <div className="space-y-1.5">
          <Skeleton className="h-[13px] w-24" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>

      {/* Right: status badge + action button */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-7 w-20 rounded-lg" />
      </div>
    </div>
  );
}
