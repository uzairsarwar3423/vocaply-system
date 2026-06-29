"use client";

import React from "react";
import { Search, Bell } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface TopbarOverflowMenuProps {
  /** Opens the command palette — same action as ⌘K */
  onOpenSearch: () => void;
  /** Opens the notification bell dropdown */
  onOpenNotifications: () => void;
  /** Raw unread count from useUnreadCount() — computed upstream, not here */
  unreadCount: number;
}

/**
 * TopbarOverflowMenu — Day 45 §4.3 / §6.5
 *
 * Below 640px: absorbs GlobalSearch trigger + NotificationBell into a single icon-button.
 * Visibility is CSS-driven (not a JS resize listener) — zero layout-thrash risk.
 *
 * Critical spec points (§4.3):
 * - "Search" item calls the SAME command palette as ⌘K — not a separate mobile search UI
 * - "Notifications" opens the SAME NotificationBellDropdown, anchored to this button
 * - ⌘K still fires the palette directly at any viewport — overflow button is a
 *   VISIBLE-TRIGGER convenience for touch, never the keyboard shortcut's only path
 * - Badge: plain dot when unreadCount > 0 (Poppins numeral doesn't fit at this icon size;
 *   a dot preserves "there's something here" without false precision)
 *
 * Dumb presentational component per §6.5 — receives all callbacks via props,
 * does NOT independently call useUnreadCount() or reach into command-palette internals.
 */
export function TopbarOverflowMenu({
  onOpenSearch,
  onOpenNotifications,
  unreadCount,
}: TopbarOverflowMenuProps) {
  const hasUnread = unreadCount > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          id="topbar-overflow-menu-trigger"
          type="button"
          aria-label={
            hasUnread
              ? `More options, ${unreadCount} unread notifications`
              : "More options"
          }
          className={cn(
            "relative flex h-9 w-9 items-center justify-center rounded-lg",
            "border border-border/40 bg-background/50",
            "text-muted-foreground hover:text-foreground hover:bg-surface-hover",
            "transition-colors duration-120",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "cursor-pointer select-none"
          )}
        >
          {/* Stacked icon: search + bell merged into a single overflow indicator */}
          <Search className="h-4 w-4" aria-hidden="true" />

          {/* Unread dot — plain dot, NOT Poppins numeral (too small at this size) */}
          {hasUnread && (
            <span
              aria-hidden="true"
              className={cn(
                "absolute -top-0.5 -right-0.5",
                "h-2 w-2 rounded-full bg-primary",
                "ring-1 ring-background",
                "animate-in zoom-in-50 duration-150"
              )}
            />
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-44 p-1"
      >
        {/* Search — opens the command palette, identical to ⌘K */}
        <DropdownMenuItem
          onSelect={onOpenSearch}
          className="flex items-center gap-2.5 cursor-pointer rounded-md px-2.5 py-2 text-xs font-medium"
        >
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span>Search</span>
          {/* Visual reminder that ⌘K works independently */}
          <span className="ml-auto text-[10px] text-muted-subtle font-mono">⌘K</span>
        </DropdownMenuItem>

        {/* Notifications — opens the same bell dropdown */}
        <DropdownMenuItem
          onSelect={onOpenNotifications}
          className="flex items-center gap-2.5 cursor-pointer rounded-md px-2.5 py-2 text-xs font-medium"
        >
          <Bell className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span>Notifications</span>
          {hasUnread && (
            <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-bold text-primary-foreground tabular-nums">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
