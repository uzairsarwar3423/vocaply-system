import React from "react";
import { cn } from "@/lib/utils";

/**
 * Named breakpoint constants — Day 45 §3 / §6.4
 *
 * These are the SINGLE source of truth for all responsive thresholds.
 * No component should ever hardcode raw pixel values like `640` or `768`.
 *
 * SIDEBAR_BREAKPOINT (768px):
 *   - Below: Sidebar hidden, MobileNav + MobileDrawer shown
 *   - Above: Persistent sidebar (icon-only at 768–1023px, full at ≥1024px)
 *
 * DENSE_LIST_BREAKPOINT (640px):
 *   - Below: Rows collapse to stacked 2-line layout
 *   - Above: Full multi-column table layout
 *
 * These are deliberately DIFFERENT thresholds (see §3 — the four-tier contract).
 * 640–767px = Drawer + full table columns (large phone landscape / small tablet portrait)
 */
export const SIDEBAR_BREAKPOINT = 768 as const;
export const DENSE_LIST_BREAKPOINT = 640 as const;

/** CSS custom property equivalents for use in inline styles where needed */
export const BREAKPOINT_VARS = {
  sidebar: `${SIDEBAR_BREAKPOINT}px`,
  denseList: `${DENSE_LIST_BREAKPOINT}px`,
} as const;

// ─── ResponsiveRow ───────────────────────────────────────────────────────────

interface ResponsiveRowProps {
  /**
   * Primary identifier content (title/name).
   * Rendered full-width on mobile, in its natural grid column on desktop.
   * Inter 500, truncates with ellipsis.
   */
  primaryContent: React.ReactNode;

  /**
   * Secondary metadata content — up to 3 chips/badges inline on mobile.
   * Rendered in its natural columns on desktop.
   * Should be small badges / status chips / short text fragments.
   */
  secondaryContent: React.ReactNode;

  /**
   * Additional desktop-only columns rendered after secondary content.
   * Hidden below DENSE_LIST_BREAKPOINT — mobile row only shows primary + secondary.
   */
  desktopExtra?: React.ReactNode;

  /**
   * Trailing actions (e.g., row menu, download button).
   * Always visible at every breakpoint — trailing action column does not collapse.
   */
  trailingActions?: React.ReactNode;

  /** Click handler — attached to the whole row at EVERY breakpoint */
  onClick?: () => void;

  /** Accessible label for the row */
  "aria-label"?: string;

  className?: string;
  children?: React.ReactNode;
}

/**
 * ResponsiveRow — Day 45 §4.4 / §6.4
 *
 * The ONE implementation of "dense list row collapses to stacked 2-line layout
 * below 640px." All five consuming components (MeetingCard, CommitmentCard,
 * ActionItemRow, MemberRow, InvoiceRow) compose this rather than each
 * implementing their own @media logic.
 *
 * Layout contract:
 * - ≥640px: grid passthrough — consuming component's existing column structure
 * - <640px: CSS Grid area swap to stacked 2-line:
 *     Line 1 = primaryContent (full width, Inter 500, ellipsis)
 *     Line 2 = secondaryContent (up to 3 inline chips, muted)
 *
 * Critical rules (from spec §4.4):
 * - SAME DOM structure at both sizes — CSS reflows, not two JSX trees
 * - SAME whole-row click target at every breakpoint
 * - NO animation on breakpoint reflow itself (resize must be instant)
 * - aria-label/accessible-name content is identical at both sizes
 */
export function ResponsiveRow({
  primaryContent,
  secondaryContent,
  desktopExtra,
  trailingActions,
  onClick,
  "aria-label": ariaLabel,
  className,
}: ResponsiveRowProps) {
  const isClickable = typeof onClick === "function";

  return (
    <div
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      aria-label={ariaLabel}
      onClick={onClick}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={cn(
        // Base: flex container, full-width click target at every breakpoint
        "group relative flex w-full items-center gap-3 px-3 py-2.5",
        "border-b border-border/40 last:border-b-0",
        "select-none transition-colors duration-100",
        isClickable &&
          "cursor-pointer hover:bg-surface-hover focus-visible:outline-none focus-visible:bg-surface-hover",
        className
      )}
    >
      {/*
       * Inner grid — this is what changes at the breakpoint.
       * CSS Grid template-areas swap via a Tailwind responsive modifier.
       * NO JS conditional rendering — same DOM, pure CSS reflow.
       *
       * Desktop (≥640px): primary | secondary | desktopExtra | trailing
       * Mobile (<640px):
       *   [primary  ][ trailing ]
       *   [secondary            ]
       */}
      <div
        className={cn(
          "flex-1 min-w-0",
          // Desktop: single row, natural flow
          "sm:grid sm:grid-cols-[1fr_auto] sm:items-center sm:gap-3",
          // Mobile: 2-line stacked
          "grid grid-rows-[auto_auto] gap-0.5",
          "grid-cols-1"
        )}
        style={{
          // CSS Grid areas for the responsive swap
          // Below sm: "primary / secondary" stacked
          // Above sm: back to flex/grid via Tailwind sm: overrides
        }}
      >
        {/* Line 1 / Desktop primary: title / name */}
        <div
          className={cn(
            "min-w-0 font-sans text-[13px] font-medium text-foreground",
            "truncate leading-[18px]"
          )}
        >
          {primaryContent}
        </div>

        {/* Line 2 / Desktop secondary: metadata chips */}
        <div
          className={cn(
            "flex flex-wrap items-center gap-1.5",
            "font-sans text-[11px] text-muted-foreground",
            "leading-[16px]"
          )}
        >
          {secondaryContent}
        </div>

        {/* Desktop-only extra columns (hidden on mobile) */}
        {desktopExtra && (
          <div className="hidden sm:flex sm:items-center sm:gap-3 sm:col-start-2">
            {desktopExtra}
          </div>
        )}
      </div>

      {/* Trailing actions — always visible, always in the same position */}
      {trailingActions && (
        <div
          className="flex shrink-0 items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          {trailingActions}
        </div>
      )}
    </div>
  );
}
