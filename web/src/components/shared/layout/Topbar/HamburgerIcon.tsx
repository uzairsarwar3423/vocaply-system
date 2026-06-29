"use client";

import { PanelLeft, PanelLeftClose } from "lucide-react";
import { cn } from "@/lib/utils";

interface HamburgerIconProps {
  open: boolean;
  className?: string;
}

/**
 * Mobile nav toggle icon using the same PanelLeft / PanelLeftClose icons
 * as the desktop SidebarCollapseButton, so the visual language is consistent.
 *
 * closed → PanelLeft      (open the drawer)
 * open   → PanelLeftClose (close the drawer)
 *
 * The icon cross-fades with a 200ms opacity + scale transition.
 */
export function HamburgerIcon({ open, className }: HamburgerIconProps) {
  return (
    <span className={cn("relative flex h-4 w-4 items-center justify-center", className)}>
      {/* PanelLeft — shown when drawer is closed */}
      <PanelLeft
        className={cn(
          "absolute h-4 w-4 transition-all duration-200 ease-in-out",
          open ? "opacity-0 scale-75" : "opacity-100 scale-100"
        )}
      />
      {/* PanelLeftClose — shown when drawer is open */}
      <PanelLeftClose
        className={cn(
          "absolute h-4 w-4 transition-all duration-200 ease-in-out",
          open ? "opacity-100 scale-100" : "opacity-0 scale-75"
        )}
      />
    </span>
  );
}
