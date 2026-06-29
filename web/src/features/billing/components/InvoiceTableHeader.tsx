"use client";

import React from "react";

/**
 * InvoiceTableHeader — column headers matching the InvoiceRow grid layout.
 * Column alignment: Date/Description left-aligned, Amount right-aligned,
 * Status centered, Download trailing-right (plan §6.4 — numeric columns always right-aligned).
 */
export function InvoiceTableHeader() {
  return (
    <div className="grid grid-cols-[20px_1fr_auto_auto_auto] items-center gap-3 px-4 py-2 border-b border-border/50">
      {/* Spacer for chevron col */}
      <div aria-hidden="true" />
      <span className="text-[12px] font-sans font-medium uppercase tracking-[0.02em] text-muted-foreground/50 leading-[16px]">
        Invoice
      </span>
      <span className="text-[12px] font-sans font-medium uppercase tracking-[0.02em] text-muted-foreground/50 leading-[16px] text-right">
        Amount
      </span>
      <span className="text-[12px] font-sans font-medium uppercase tracking-[0.02em] text-muted-foreground/50 leading-[16px] text-center">
        Status
      </span>
      <div aria-hidden="true" className="w-7" />
    </div>
  );
}
