"use client";

import React, { useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface WidgetErrorFallbackProps {
  /** Brief description of what this widget does, used in copy */
  label?: string;
  /** Retry callback — passed from the wrapping ErrorBoundary or parent */
  onRetry?: () => void;
  className?: string;
}

/**
 * WidgetErrorFallback — Day 45 §4.6 / §6.3
 *
 * Widget-level error surface: inline, sized to the widget's bounding box.
 * Deliberately SMALLER and quieter than RouteErrorFallback.
 *
 * Key distinctions from RouteErrorFallback (§6.3 spec):
 * - No "Go to dashboard" escape hatch (surrounding page already provides nav)
 * - "Retry" is a text link, not a full button
 * - Compact height — must fit inside a chart card or widget panel
 * - Copy describes the specific widget failure, not a whole-page failure
 *
 * Usage: wrap individual charts, data panels, or any isolated async widget.
 * The surrounding page and its other widgets remain fully functional.
 */
export function WidgetErrorFallback({
  label = "this widget",
  onRetry,
  className,
}: WidgetErrorFallbackProps) {
  const [isPending, startTransition] = useTransition();
  const [hasRetried, setHasRetried] = useState(false);

  const handleRetry = () => {
    if (!onRetry) return;
    setHasRetried(true);
    startTransition(() => {
      onRetry();
    });
    setTimeout(() => setHasRetried(false), 1500);
  };

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg",
        "border border-dashed border-border/50 bg-surface/30",
        "px-4 py-6 text-center min-h-[80px]",
        "animate-in fade-in-0 duration-150",
        className
      )}
    >
      <AlertTriangle className="h-3.5 w-3.5 text-muted-subtle" />

      <div className="space-y-0.5">
        <p className="font-sans text-xs font-medium text-muted-foreground">
          Couldn&apos;t load {label}
        </p>
        {onRetry && (
          <button
            onClick={handleRetry}
            disabled={isPending || hasRetried}
            className={cn(
              "font-sans text-xs text-muted-subtle hover:text-muted-foreground",
              "underline underline-offset-2 transition-colors duration-120",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "cursor-pointer"
            )}
          >
            {hasRetried ? "Retrying…" : "Retry"}
          </button>
        )}
      </div>
    </div>
  );
}
