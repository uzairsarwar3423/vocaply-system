"use client";

import React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TopBannerProps {
  /** 'neutral' = muted bg (OfflineBanner), 'attention' = amber/warning bg (PaymentFailedBanner) */
  variant: "neutral" | "attention";
  icon?: React.ReactNode;
  children: React.ReactNode;
  /** If provided, renders an × dismiss button */
  onDismiss?: () => void;
  className?: string;
}

/**
 * TopBanner — shared shell for all page-level banners.
 * Mounted at the very top of the viewport content area.
 * Motion: slides down 140ms ease-out on mount (matches plan §4.9).
 */
export function TopBanner({
  variant,
  icon,
  children,
  onDismiss,
  className,
}: TopBannerProps) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        "w-full flex items-center justify-between gap-3 px-4 py-2",
        "text-[13px] font-sans font-normal leading-[20px]",
        "border-b select-none",
        "animate-in slide-in-from-top duration-[140ms] ease-out",
        variant === "neutral"
          ? "bg-muted/70 border-border text-muted-foreground"
          : "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/40 text-amber-900 dark:text-amber-200",
        className
      )}
    >
      {/* Leading icon + content */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {icon && (
          <span className="shrink-0 flex items-center" aria-hidden="true">
            {icon}
          </span>
        )}
        <span className="truncate">{children}</span>
      </div>

      {/* Dismiss button — only when onDismiss is provided */}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss banner"
          className={cn(
            "shrink-0 h-5 w-5 flex items-center justify-center rounded",
            "opacity-60 hover:opacity-100 transition-opacity duration-100 focus:outline-none",
            "focus-visible:ring-2 focus-visible:ring-current"
          )}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
