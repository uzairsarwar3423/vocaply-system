"use client";

import dynamic from "next/dynamic";
import { useState, useCallback } from "react";
import { SidebarProvider } from "./Sidebar/SidebarProvider";
import { Sidebar } from "./Sidebar/Sidebar";
import { Topbar } from "./Topbar/Topbar";
import { MobileNav } from "./MobileNav";
import { MobileDrawer } from "./MobileDrawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// Code-split the command menu palette so it's loaded lazy-loaded on the client on-demand (Cmd+K).
const CommandMenu = dynamic(
  () => import("./CommandMenu/CommandMenu").then((m) => m.CommandMenu),
  { ssr: false }
);

import { User } from "@/features/auth/types/auth.types";

/**
 * Breakpoint constants — Day 45 §3
 * Single source of truth. No raw pixel values anywhere else.
 *
 * SIDEBAR_BREAKPOINT (768px):
 *   - Below: Sidebar hidden; MobileNav + MobileDrawer shown
 *   - 768–1023px: Icon-only sidebar (56px)
 *   - ≥1024px: Full sidebar (240px)
 *
 * DENSE_LIST_BREAKPOINT (640px):
 *   - Below: Rows collapse to stacked 2-line layout; Topbar Search+Bell → overflow icon
 *   - Above: Full table columns; Search+Bell visible
 *
 * These are TWO different thresholds — 640–767px gets Drawer + full table columns.
 */
export const SIDEBAR_BREAKPOINT = 768 as const;
export const DENSE_LIST_BREAKPOINT = 640 as const;

interface Team {
  id: string;
  name: string;
  logo?: string;
  plan?: string;
}

interface AppShellProps {
  user: User | null;
  team: Team | null;
  defaultCollapsed: boolean;
  children: React.ReactNode;
}

export function AppShell({
  user,
  team,
  defaultCollapsed,
  children,
}: AppShellProps) {
  // MobileDrawer state lives here — AppShell is the single owner.
  // Both Topbar hamburger and MobileNav "More" tap call the same setter.
  const [drawerOpen, setDrawerOpen] = useState(false);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  return (
    <SidebarProvider defaultCollapsed={defaultCollapsed}>
      <div className="dashboard-theme flex h-dvh w-screen overflow-hidden bg-background">
        {/* Sidebar — hidden below SIDEBAR_BREAKPOINT (768px) via CSS */}
        <div className="hidden md:flex">
          <Sidebar user={user} team={team} />
        </div>

        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Topbar receives openDrawer + drawerOpen so the icon can animate */}
          <Topbar onOpenDrawer={openDrawer} drawerOpen={drawerOpen} />

          <div className="flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              {/* pb-14 on mobile accounts for MobileNav 56px height */}
              <main className={cn("min-h-full", "pb-14 md:pb-0")}>
                {children}
              </main>
            </ScrollArea>
          </div>
        </div>
      </div>

      <CommandMenu />

      {/* MobileNav — fixed bottom bar, shown below SIDEBAR_BREAKPOINT */}
      <MobileNav onOpenDrawer={openDrawer} />

      {/* MobileDrawer — slide-in left panel, same instance for both entry points */}
      <MobileDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        team={team}
        triggerId="topbar-hamburger"
      />
    </SidebarProvider>
  );
}
