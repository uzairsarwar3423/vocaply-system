"use client";

import React from "react";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDownloadInvoice } from "../hooks/useDownloadInvoice";
import type { Invoice } from "../types";

interface InvoiceDownloadButtonProps {
  invoice: Invoice;
}

/**
 * InvoiceDownloadButton — icon-only, inline state (plan §4.6):
 * idle: download icon at full opacity
 * fetching: icon dims to 50% opacity, NO spinner
 * error: 4s inline tooltip-style message, auto-dismissed
 */
export function InvoiceDownloadButton({ invoice }: InvoiceDownloadButtonProps) {
  const { download, stateFor, errorFor } = useDownloadInvoice();

  const state = stateFor(invoice.id);
  const error = errorFor(invoice.id);
  const isFetching = state === "fetching";

  if (!invoice.pdfUrl && !invoice.id) return null;

  return (
    <div className="relative flex flex-col items-center">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation(); // Prevent InvoiceRow collapsible toggle (plan §4.5)
          download(invoice.id, invoice.number);
        }}
        disabled={isFetching}
        aria-label={`Download invoice ${invoice.number}`}
        className={cn(
          "h-7 w-7 flex items-center justify-center rounded-md",
          "text-muted-foreground",
          "hover:bg-muted/50 hover:text-foreground",
          "transition-all duration-100",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed"
        )}
      >
        <Download
          className={cn(
            "h-3.5 w-3.5 transition-opacity duration-100",
            isFetching ? "opacity-50" : "opacity-100"
          )}
        />
      </button>

      {/* Inline tooltip-style error — anchored at button, auto-dismissed after 4s */}
      {error && (
        <div
          role="alert"
          className={cn(
            "absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2",
            "bg-foreground text-background text-[11px] font-sans font-medium",
            "px-2 py-1 rounded-md whitespace-nowrap shadow-md",
            "animate-in fade-in zoom-in-95 duration-150",
            "pointer-events-none select-none"
          )}
        >
          {error}
        </div>
      )}
    </div>
  );
}
