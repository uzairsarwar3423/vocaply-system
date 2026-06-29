"use client";

import React from "react";
import { X } from "lucide-react";
import { SidebarTeamSwitcher } from "./Sidebar/SidebarTeamSwitcher";
import { cn } from "@/lib/utils";

interface Team {
  id: string;
  name: string;
  logo?: string;
  plan?: string;
}

interface MobileDrawerHeaderProps {
  team: Team | null;
  onClose: () => void;
}

/**
 * MobileDrawerHeader — Day 45 §6.2
 *
 * Team switcher + close button row inside MobileDrawer.
 *
 * Deliberately reuses SidebarTeamSwitcher (Day 26) rather than building
 * a second team-switcher UI for mobile — confirms the component generalizes
 * correctly inside a Drawer's narrower context (same as how TeamSlugField
 * generalized across Settings + Onboarding on Day 44).
 *
 * First focusable element in the Drawer — receives focus on open per §4.2
 * focus-trap spec (the team switcher trigger is the first Tab stop).
 */
export function MobileDrawerHeader({ team, onClose }: MobileDrawerHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between",
        "border-b border-border px-3 py-2"
      )}
    >
      {/* Team switcher — first focusable element, receives focus on Drawer open */}
      <div className="flex-1 min-w-0">
        {/* collapsed=false so the switcher shows the full team name + chevron */}
        <SidebarTeamSwitcher team={team} collapsed={false} />
      </div>

      {/* Close button — returns focus to whichever trigger opened the Drawer */}
      <button
        onClick={onClose}
        aria-label="Close navigation menu"
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
          "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
          "transition-colors duration-120",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "cursor-pointer"
        )}
        type="button"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
