"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { useBillingPortal } from "../hooks/useBillingPortal";
import { cn } from "@/lib/utils";

/**
 * BillingPortalButton — label-swap pattern (plan §4.4):
 * idle: "Manage billing" | redirecting: "Redirecting…" (120ms crossfade)
 * Disabled instantly on click — prevents double-click.
 * Failure: row-anchored inline error beneath the button, not a toast.
 */
export function BillingPortalButton() {
  const { openPortal, buttonState, inlineError } = useBillingPortal();

  const isRedirecting = buttonState === "redirecting";

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        size="sm"
        onClick={openPortal}
        disabled={isRedirecting}
        className={cn(
          "h-9 px-4 text-[13px] font-sans font-medium",
          "transition-all duration-[120ms]"
        )}
        aria-live="polite"
        aria-label={isRedirecting ? "Redirecting to billing portal…" : "Manage billing"}
      >
        <span
          className={cn(
            "transition-opacity duration-[120ms]",
            isRedirecting ? "opacity-0 absolute" : "opacity-100"
          )}
          aria-hidden={isRedirecting}
        >
          Manage billing
        </span>
        <span
          className={cn(
            "transition-opacity duration-[120ms]",
            !isRedirecting ? "opacity-0 absolute" : "opacity-100"
          )}
          aria-hidden={!isRedirecting}
        >
          Redirecting…
        </span>
      </Button>

      {/* Row-anchored inline error (plan §4.4 failure state — NOT a toast) */}
      {inlineError && (
        <p
          role="alert"
          className="text-[11px] font-sans font-medium text-destructive animate-in fade-in duration-150 leading-[16px]"
        >
          {inlineError}
        </p>
      )}
    </div>
  );
}
