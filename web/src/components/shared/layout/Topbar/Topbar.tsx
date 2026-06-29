"use client";

import { SidebarCollapseButton } from "@/components/shared/layout/Sidebar/SidebarCollapseButton";
import { Breadcrumb } from "./Breadcrumb";
import { SearchTrigger } from "./SearchTrigger";
import { TopbarActions } from "./TopbarActions";
import { NotificationBell } from "./NotificationBell";
import { PresenceAvatars } from "./PresenceAvatars";
import { TopbarOverflowMenu } from "./TopbarOverflowMenu";
import { HamburgerIcon } from "./HamburgerIcon";
import { useUIStore } from "@/store/ui.store";
import { useUnreadCount } from "@/features/notifications/hooks/useUnreadCount";
import { cn } from "@/lib/utils";

interface TopbarProps {
  /** Opens the MobileDrawer — passed from AppShell which owns the drawer state */
  onOpenDrawer?: () => void;
  /** Whether the MobileDrawer is currently open — drives the animated toggle icon */
  drawerOpen?: boolean;
}

/**
 * Topbar — Day 45 §4.3 update
 *
 * Below 640px (DENSE_LIST_BREAKPOINT):
 *   - SearchTrigger + NotificationBell hidden via CSS (md:hidden / max-sm:hidden)
 *   - TopbarOverflowMenu shown — absorbs both triggers into one icon-button
 *   - ⌘K still fires the command palette directly (keyboard parity, spec §4.3)
 *
 * Below 768px (SIDEBAR_BREAKPOINT):
 *   - Hamburger button shown — opens MobileDrawer
 *   - SidebarCollapseButton hidden (no sidebar to collapse)
 */
export function Topbar({ onOpenDrawer, drawerOpen = false }: TopbarProps) {
  const openCommandMenu = useUIStore((state) => state.toggleCommandMenu);
  const { count: unreadCount } = useUnreadCount();

  return (
    <header className="flex h-topbar shrink-0 items-center justify-between border-b border-border bg-background px-4 select-none">
      <div className="flex items-center gap-3">
        {/* Hamburger toggle — visible below 768px only (sidebar hidden there).
             Animates ≡ → ✕ based on drawerOpen state. */}
        {onOpenDrawer && (
          <button
            id="topbar-hamburger"
            type="button"
            onClick={onOpenDrawer}
            aria-label={drawerOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={drawerOpen}
            aria-controls="mobile-drawer"
            className={cn(
              "flex md:hidden h-8 w-8 items-center justify-center rounded-md",
              "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
              "transition-colors duration-120",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "cursor-pointer"
            )}
          >
            <HamburgerIcon open={drawerOpen} />
          </button>
        )}

        {/* SidebarCollapseButton — hidden below 768px (no sidebar there) */}
        <div className="hidden md:flex">
          <SidebarCollapseButton />
        </div>

        <Breadcrumb />
      </div>

      {/* Search — hidden below 640px, replaced by TopbarOverflowMenu */}
      <div className="flex-1 hidden sm:flex justify-center">
        <SearchTrigger />
      </div>

      <div className="flex items-center gap-4">
        <PresenceAvatars />
        <div className="flex items-center gap-2">
          <TopbarActions />

          {/* NotificationBell — hidden below 640px */}
          <div className="hidden sm:flex">
            <NotificationBell />
          </div>

          {/* TopbarOverflowMenu — visible below 640px, absorbs Search + Bell */}
          <div className="flex sm:hidden">
            <TopbarOverflowMenu
              onOpenSearch={openCommandMenu}
              onOpenNotifications={() => {
                /* NotificationBellDropdown is triggered via its own internal state;
                   for the overflow path we dispatch a custom event so the Bell's
                   own DropdownMenu can react without tight coupling */
                window.dispatchEvent(new CustomEvent("vocaply:open-notifications"));
              }}
              unreadCount={unreadCount}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
