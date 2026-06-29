"use client";

import React from "react";
import Link from "next/link";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileNavItemProps {
  href?: string;
  icon: LucideIcon;
  label: string;
  /** Computed once in MobileNav — avoids 5 redundant router subscriptions */
  isActive: boolean;
  /** For "More" — fires instead of navigating */
  onClick?: () => void;
}

/**
 * MobileNavItem — Day 45 §4.1 / §6.1
 *
 * Single nav-destination button for the bottom MobileNav bar.
 *
 * Active state: identical "subtle background fill on icon's hit-area" treatment
 * as SidebarNavItem (Day 26) — NO pill, NO underline bar. Direct visual parity.
 *
 * Tap feedback: 80ms opacity dip to 0.7 on press (:active / touch-start),
 * reverts on release. Touch has no native hover — this is the confirmation signal.
 *
 * Touch target: minimum 44×44px per Apple/WCAG recommendation.
 */
export function MobileNavItem({
  href,
  icon: Icon,
  label,
  isActive,
  onClick,
}: MobileNavItemProps) {
  const itemClasses = cn(
    // Layout: minimum 44×44px touch target, flex column centering
    "relative flex flex-col items-center justify-center gap-0.5",
    "min-h-[44px] min-w-[44px] flex-1 rounded-lg",
    // Transitions — 80ms for tap feedback; 120ms for active state
    "transition-all duration-120",
    // Tap feedback: opacity dip on press (replicates 'tactile confirmation' from Day 44)
    "active:opacity-70",
    // Active state: same bg-surface-hover as SidebarNavItem — NO pill, NO bar
    isActive
      ? "bg-surface-hover text-foreground"
      : "text-muted-foreground hover:bg-surface-hover/60 hover:text-foreground",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    "select-none cursor-pointer"
  );

  const content = (
    <>
      <Icon
        className={cn(
          "h-[18px] w-[18px] shrink-0 transition-colors duration-120",
          isActive ? "text-foreground" : "text-muted-foreground"
        )}
        aria-hidden="true"
      />
      <span
        className={cn(
          "text-[10px] font-sans font-medium leading-none transition-colors duration-120",
          isActive ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {label}
      </span>
    </>
  );

  if (onClick) {
    return (
      <button
        onClick={onClick}
        aria-label={label}
        className={itemClasses}
        type="button"
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      href={href!}
      aria-label={label}
      aria-current={isActive ? "page" : undefined}
      className={itemClasses}
    >
      {content}
    </Link>
  );
}
