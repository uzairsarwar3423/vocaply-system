"use client";

import React, { useState, useTransition } from "react";
import { AlertTriangle, RefreshCw, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface RouteErrorFallbackProps {
  /** The error that caused this boundary to render */
  error: Error & { digest?: string };
  /** Next.js built-in reset — re-renders the failing route segment fresh */
  reset: () => void;
  /** Human-readable name of what failed, e.g. "this page" or "Analytics" */
  context?: string;
  className?: string;
}

/**
 * RouteErrorFallback — Day 45 §4.5 / §6.3
 *
 * Route-level error surface: takes over an entire route segment.
 * Distinct from WidgetErrorFallback (which is inline + smaller).
 *
 * Retry mechanics:
 * - First attempt: button swaps label → "Retrying…" (120ms crossfade, no spinner)
 * - After 2 failed retries: shows "Go to dashboard" escape-hatch link
 * - Never traps user in a retry loop with no exit
 *
 * Visual family: matches EmptyState (centered, Inter, text-only, one action).
 */
export function RouteErrorFallback({
  error,
  reset,
  context = "this page",
  className,
}: RouteErrorFallbackProps) {
  const [retryCount, setRetryCount] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = () => {
    setIsRetrying(true);
    setRetryCount((c) => c + 1);

    startTransition(() => {
      reset();
    });

    // Label swap: 120ms crossfade — reset the "Retrying…" state after a beat
    // If the segment recovers, this component unmounts so the timeout is harmless.
    setTimeout(() => {
      setIsRetrying(false);
    }, 2000);
  };

  const showEscapeHatch = retryCount >= 2;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-20 px-4 text-center",
        "animate-in fade-in-0 duration-150",
        className
      )}
    >
      {/* Icon */}
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-surface border border-border/60">
        <AlertTriangle className="h-4.5 w-4.5 text-muted-foreground" />
      </div>

      {/* Copy — Inter, text-only, no illustration */}
      <div className="space-y-1.5 max-w-sm">
        <h2 className="font-sans text-sm font-semibold text-foreground">
          Something went wrong loading {context}
        </h2>
        <p className="font-sans text-xs text-muted-foreground leading-relaxed">
          An unexpected error occurred. This is usually temporary — try again
          and it should resolve.
          {error.digest && (
            <span className="block mt-1 text-[11px] text-muted-subtle font-mono">
              Error ID: {error.digest}
            </span>
          )}
        </p>
      </div>

      {/* Actions */}
      <div className="mt-6 flex flex-col items-center gap-3">
        {/* Try again — label-swap pending state, 120ms crossfade */}
        <button
          onClick={handleRetry}
          disabled={isPending || isRetrying}
          className={cn(
            "relative flex items-center gap-1.5 px-4 py-2",
            "font-sans text-xs font-semibold text-foreground",
            "bg-surface border border-border rounded-lg shadow-sm",
            "hover:bg-surface-hover transition-colors duration-120",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:opacity-60 disabled:cursor-not-allowed",
            "select-none cursor-pointer"
          )}
        >
          <RefreshCw
            className={cn(
              "h-3 w-3 transition-opacity duration-[120ms]",
              isRetrying && "animate-spin"
            )}
          />
          {/* Label swap: crossfade between "Try again" and "Retrying…" */}
          <span
            className={cn(
              "transition-opacity duration-[120ms]",
              isRetrying ? "opacity-0 absolute" : "opacity-100 relative"
            )}
          >
            Try again
          </span>
          <span
            className={cn(
              "transition-opacity duration-[120ms]",
              isRetrying ? "opacity-100 relative" : "opacity-0 absolute"
            )}
          >
            Retrying…
          </span>
        </button>

        {/* Escape hatch: shown only after 2 failed retries */}
        {showEscapeHatch && (
          <Link
            href="/dashboard"
            className={cn(
              "flex items-center gap-1.5",
              "font-sans text-xs text-muted-foreground hover:text-foreground",
              "transition-colors duration-120",
              "animate-in fade-in-0 slide-in-from-bottom-1 duration-200"
            )}
          >
            <LayoutDashboard className="h-3 w-3" />
            Go to dashboard
          </Link>
        )}
      </div>
    </div>
  );
}
