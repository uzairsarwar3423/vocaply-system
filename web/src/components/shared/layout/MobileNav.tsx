"use client";

import React from "react";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Video,
  CheckCircle2,
  ListTodo,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MobileNavItem } from "./MobileNavItem";

interface MobileNavProps {
  /** Opens the mobile drawer */
  onOpenDrawer: () => void;
}

// Nav destinations — mirrors Sidebar.tsx's nav items
// "More" is the 5th slot and opens the Drawer, NOT a 6th overflow sheet
const NAV_ITEMS = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/meetings", icon: Video, label: "Meetings" },
  { href: "/commitments", icon: CheckCircle2, label: "Commitments" },
  { href: "/action-items", icon: ListTodo, label: "Items" },
] as const;

/**
 * MobileNav — Day 45 §4.1
 *
 * Fixed bottom navigation bar for <768px viewports (sidebar hidden).
 * 5 equal-width slots: Dashboard, Meetings, Commitments, Action Items, More.
 *
 * Design decisions (from spec §4.1):
 * - isActive computed ONCE here from usePathname(), passed as prop to each item
 *   → avoids 5 redundant re-render triggers on every navigation
 * - "More" opens MobileDrawer — the SAME destination as the Topbar hamburger,
 *   never a separate "more menu" implementation
 * - safe-area-inset-bottom respected for iOS home indicator
 * - Active state: bg-surface-hover fill (identical to SidebarNavItem Day 26)
 *   NO pill, NO underline bar
 */
export function MobileNav({ onOpenDrawer }: MobileNavProps) {
  const pathname = usePathname();

  // Compute isActive once for all items — one subscription, not five
  const getIsActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <nav
      aria-label="Main navigation"
      className={cn(
        // Fixed bottom, full-width, 56px height
        "fixed bottom-0 left-0 right-0 z-50",
        "h-14 border-t border-border bg-background",
        // iOS safe area inset
        "pb-[env(safe-area-inset-bottom,0px)]",
        // Only visible below 768px (SIDEBAR_BREAKPOINT)
        "flex md:hidden"
      )}
    >
      <div className="flex w-full items-center justify-around px-1">
        {NAV_ITEMS.map(({ href, icon, label }) => (
          <MobileNavItem
            key={href}
            href={href}
            icon={icon}
            label={label}
            isActive={getIsActive(href)}
          />
        ))}

        {/* "More" — opens MobileDrawer, same destination as Topbar hamburger */}
        <MobileNavItem
          icon={MoreHorizontal}
          label="More"
          isActive={false}
          onClick={onOpenDrawer}
          aria-label="Open navigation menu"
        />
      </div>
    </nav>
  );
}
