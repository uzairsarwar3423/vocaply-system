"use client";

import React, { useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { InvoiceStatusBadge } from "./InvoiceStatusBadge";
import { InvoiceRowDetail } from "./InvoiceRowDetail";
import { InvoiceDownloadButton } from "./InvoiceDownloadButton";
import type { Invoice } from "../types";
import { cn } from "@/lib/utils";

interface InvoiceRowProps {
  invoice: Invoice;
}

function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(isoDate));
}

function formatAmount(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

/**
 * InvoiceRow — Collapsible with chevron rotation (plan §4.5):
 * - Click anywhere on the row EXCEPT the trailing download icon toggles expand.
 * - Collapsible height 0→auto, 160ms ease-out.
 * - Chevron rotates 0°→90° in lockstep with expand.
 * - Multiple rows can be open simultaneously (NOT an accordion — plan §4.5).
 * - InvoiceRow renders as a <Collapsible> wrapping a table-row-shaped trigger,
 *   NOT a literal nested <table> inside a <tr> (which would be invalid HTML).
 */
export function InvoiceRow({ invoice }: InvoiceRowProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} asChild>
      <div>
        {/* Trigger row — visually a table row, semantically a button */}
        <CollapsibleTrigger asChild>
          <div
            role="button"
            tabIndex={0}
            aria-expanded={isOpen}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setIsOpen((v) => !v);
              }
            }}
            className={cn(
              "grid grid-cols-[20px_1fr_auto_auto_auto] items-center gap-3 px-4 py-3",
              "cursor-pointer select-none",
              "hover:bg-muted/40 transition-colors duration-100 ease-linear",
              "focus-visible:outline-none focus-visible:bg-muted/40"
            )}
          >
            {/* Col 1: Chevron */}
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 text-muted-foreground/50 shrink-0",
                "transition-transform duration-[160ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
                isOpen && "rotate-90"
              )}
              aria-hidden="true"
            />

            {/* Col 2: Date + Description */}
            <div className="min-w-0">
              <p className="text-[13px] font-sans font-normal text-foreground leading-[20px] truncate">
                {invoice.description || `Invoice ${invoice.number}`}
              </p>
              <p className="text-[12px] font-sans font-normal text-muted-foreground/50 leading-[16px]">
                {formatDate(invoice.date)}
              </p>
            </div>

            {/* Col 3: Amount — right-aligned, Poppins tabular-nums (plan §6.4) */}
            <span
              className="font-[family-name:var(--font-poppins)] font-medium tabular-nums text-foreground leading-[20px] text-right"
              style={{ fontSize: "13px" }}
            >
              {formatAmount(invoice.amount, invoice.currency)}
            </span>

            {/* Col 4: Status badge — centered */}
            <div className="flex justify-center">
              <InvoiceStatusBadge status={invoice.status} />
            </div>

            {/* Col 5: Download — trailing right, independent click target */}
            <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
              <InvoiceDownloadButton invoice={invoice} />
            </div>
          </div>
        </CollapsibleTrigger>

        {/* Collapsible content — height 0→auto, 160ms (plan §4.5) */}
        <CollapsibleContent
          className={cn(
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "overflow-hidden",
            "transition-all duration-[160ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
          )}
          style={{
            // Use CSS variable for height animation (Radix Collapsible pattern)
            // @ts-ignore
            "--radix-collapsible-content-height": "var(--radix-collapsible-content-height)",
          }}
        >
          <div className="border-t border-border/50">
            <InvoiceRowDetail invoice={invoice} />
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
