"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface DataTableEmptyRowProps {
  /** Colspan to span the full table width */
  colSpan?: number;
  message?: string;
  className?: string;
}

/**
 * DataTableEmptyRow — generic empty state for any DataTable consumer (plan §6.9).
 * First real use: InvoiceTable when zero invoices.
 * Renders a single full-width row: centered muted Inter text.
 * No illustration — consistent with every empty state across the product since Day 26.
 */
export function DataTableEmptyRow({
  colSpan = 100,
  message = "No data yet.",
  className,
}: DataTableEmptyRowProps) {
  return (
    <tr className={cn("", className)}>
      <td
        colSpan={colSpan}
        className="py-10 text-center text-[13px] font-sans font-normal text-muted-foreground/60 select-none"
      >
        {message}
      </td>
    </tr>
  );
}
