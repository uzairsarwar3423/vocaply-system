"use client";

import React from "react";
import { InvoiceTableHeader } from "./InvoiceTableHeader";
import { InvoiceRow } from "./InvoiceRow";
import { useInvoices } from "../hooks/useInvoices";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * InvoiceTable — cursor-paginated list (plan §3):
 * - First 10 rows always shown; "Load more" button below (not infinite scroll — invoices
 *   are a bounded, deliberate-browsing list, not a feed).
 * - Empty state: DataTableEmptyRow with muted text.
 * - Uses InvoiceTableHeader + InvoiceRow composition.
 */
export function InvoiceTable() {
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInvoices();

  const allInvoices = data?.pages.flatMap((p) => p.invoices) ?? [];

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border/50 overflow-hidden">
        <div className="px-4 py-2 border-b border-border/50">
          <Skeleton className="h-4 w-40" />
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border/30 last:border-0">
            <Skeleton className="h-3.5 w-3.5" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-5 w-12 rounded-full" />
            <Skeleton className="h-7 w-7 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-[13px] font-sans font-normal text-muted-foreground/60 py-4">
        Couldn't load invoices. Please refresh the page.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div
        className="rounded-lg border border-border/50 overflow-hidden"
        role="list"
        aria-label="Invoices"
      >
        <InvoiceTableHeader />

        {allInvoices.length === 0 ? (
          <div className="py-10 text-center text-[13px] font-sans font-normal text-muted-foreground/60 select-none">
            No invoices yet — they'll appear here after your first billing cycle.
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {allInvoices.map((invoice) => (
              <InvoiceRow key={invoice.id} invoice={invoice} />
            ))}
          </div>
        )}
      </div>

      {/* Load more — explicit cursor pagination (NOT infinite scroll) */}
      {hasNextPage && (
        <div className="flex justify-center pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="text-[13px] font-sans text-muted-foreground hover:text-foreground"
          >
            {isFetchingNextPage ? "Loading…" : "Load more invoices"}
          </Button>
        </div>
      )}
    </div>
  );
}
