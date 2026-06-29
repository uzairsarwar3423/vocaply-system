"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import type { InvoiceStatus } from "../types";

const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  paid: "Paid",
  open: "Open",
  void: "Void",
  uncollectible: "Uncollectible",
};

interface InvoiceStatusBadgeProps {
  status: InvoiceStatus;
}

/**
 * InvoiceStatusBadge — 4 states, all with identical badge chrome (plan §5).
 * QA: screenshot all 4 states side-by-side to confirm pixel-identical chrome.
 */
export function InvoiceStatusBadge({ status }: InvoiceStatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className="text-[11px] font-sans font-medium uppercase tracking-[0.02em] text-muted-foreground/80 border-muted/30 px-2 py-0.5 h-5 rounded-md select-none inline-flex items-center justify-center"
    >
      {INVOICE_STATUS_LABELS[status]}
    </Badge>
  );
}
