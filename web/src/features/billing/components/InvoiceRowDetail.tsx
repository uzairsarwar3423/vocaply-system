"use client";

import React from "react";
import { Separator } from "@/components/ui/separator";
import type { Invoice } from "../types";

interface InvoiceRowDetailProps {
  invoice: Invoice;
}

function formatCents(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

/**
 * InvoiceRowDetail — renders inside the Collapsible.Content (plan §6.5).
 * Two-column key/value list of line items + subtotal/tax/total breakdown.
 * "Boring and exact" — plain Inter/Poppins text in a tight grid.
 * No new visual treatment — billing line items earn zero flair, only clarity.
 */
export function InvoiceRowDetail({ invoice }: InvoiceRowDetailProps) {
  const currency = invoice.currency;

  return (
    <div
      className="px-4 pb-4 space-y-3"
      aria-label={`Invoice ${invoice.number} line items`}
    >
      {/* Line items */}
      {invoice.lineItems.length > 0 && (
        <div className="space-y-1.5">
          {invoice.lineItems.map((item, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_auto] items-start gap-3"
            >
              <span className="text-[13px] font-sans font-normal text-muted-foreground leading-[20px]">
                {item.description}
                {item.quantity > 1 && (
                  <span className="text-[12px] text-muted-foreground/50 ml-1">
                    × {item.quantity}
                  </span>
                )}
              </span>
              <span
                className="font-[family-name:var(--font-poppins)] font-medium tabular-nums text-muted-foreground leading-[20px] text-right"
                style={{ fontSize: "13px" }}
              >
                {formatCents(item.amount, currency)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Subtotal / Tax / Total */}
      <Separator className="opacity-50" />
      <div className="space-y-1">
        {invoice.subtotal !== invoice.total && (
          <>
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <span className="text-[12px] font-sans font-normal text-muted-foreground/60 leading-[20px]">
                Subtotal
              </span>
              <span
                className="font-[family-name:var(--font-poppins)] font-medium tabular-nums text-muted-foreground/60 leading-[20px] text-right"
                style={{ fontSize: "12px" }}
              >
                {formatCents(invoice.subtotal, currency)}
              </span>
            </div>
            {invoice.tax > 0 && (
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <span className="text-[12px] font-sans font-normal text-muted-foreground/60 leading-[20px]">
                  Tax
                </span>
                <span
                  className="font-[family-name:var(--font-poppins)] font-medium tabular-nums text-muted-foreground/60 leading-[20px] text-right"
                  style={{ fontSize: "12px" }}
                >
                  {formatCents(invoice.tax, currency)}
                </span>
              </div>
            )}
          </>
        )}
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <span className="text-[13px] font-sans font-medium text-foreground leading-[20px]">
            Total
          </span>
          <span
            className="font-[family-name:var(--font-poppins)] font-medium tabular-nums text-foreground leading-[20px] text-right"
            style={{ fontSize: "13px" }}
          >
            {formatCents(invoice.total, currency)}
          </span>
        </div>
      </div>
    </div>
  );
}
