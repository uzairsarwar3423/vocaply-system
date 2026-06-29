"use client";

import React, { useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Video,
  CheckCircle2,
  ListTodo,
  Users,
  BarChart3,
  Sparkles,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MobileDrawerHeader } from "./MobileDrawerHeader";
import { SidebarNavItem } from "./Sidebar/SidebarNavItem";
import { Separator } from "@/components/ui/separator";

interface Team {
  id: string;
  name: string;
  logo?: string;
  plan?: string;
}

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  team: Team | null;
  /** ID of the element that triggered open — focus returns here on close */
  triggerId?: string;
}

/**
 * MobileDrawer — Day 45 §4.2
 *
 * Slide-in left-edge drawer for mobile navigation.
 * Opened by: bottom-nav "More" tap OR Topbar hamburger (same component, both paths).
 *
 * Timing (matching platform-wide constants from Day 41 §4.3):
 * - Entrance: translateX(-100%)→0 + backdrop opacity 0→1, 160ms ease-out
 * - Exit: 100ms (platform-wide "exits are brisk" rule)
 *
 * Focus trap:
 * - First focusable = team switcher trigger (in MobileDrawerHeader)
 * - Tab cycles within Drawer only while open
 * - Esc closes and returns focus to the opening trigger
 *
 * Dismissal triggers (all three per spec §4.2):
 * 1. Esc key
 * 2. Backdrop click
 * 3. Route change (navigation auto-closes — the one most likely to be forgotten)
 */
export function MobileDrawer({
  open,
  onClose,
  team,
  triggerId,
}: MobileDrawerProps) {
  const pathname = usePathname();
  const drawerRef = useRef<HTMLDivElement>(null);
  const prevPathnameRef = useRef(pathname);

  // ── Dismissal: route change ──────────────────────────────────────────────
  useEffect(() => {
    if (open && pathname !== prevPathnameRef.current) {
      onClose();
    }
    prevPathnameRef.current = pathname;
  }, [pathname, open, onClose]);

  // ── Dismissal: Esc key + focus management ───────────────────────────────
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      // Focus trap: Tab cycles within drawer
      if (e.key === "Tab") {
        trapFocus(e);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // Focus the first focusable element on open
  useEffect(() => {
    if (!open || !drawerRef.current) return;

    // Small RAF delay to let CSS transition start first
    const raf = requestAnimationFrame(() => {
      const focusable = getFocusableElements(drawerRef.current!);
      if (focusable.length > 0) {
        (focusable[0] as HTMLElement).focus();
      }
    });

    return () => cancelAnimationFrame(raf);
  }, [open]);

  // Return focus to trigger on close
  useEffect(() => {
    if (open) return;
    if (!triggerId) return;
    const trigger = document.getElementById(triggerId);
    if (trigger) trigger.focus();
  }, [open, triggerId]);

  // ── Scroll lock ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const trapFocus = useCallback((e: KeyboardEvent) => {
    if (!drawerRef.current) return;
    const focusable = getFocusableElements(drawerRef.current);
    if (focusable.length === 0) return;

    const first = focusable[0] as HTMLElement;
    const last = focusable[focusable.length - 1] as HTMLElement;

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, []);

  return (
    <>
      {/* Backdrop — opacity 0→1 entrance, click dismisses */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]",
          "md:hidden", // only present below 768px
          "transition-opacity",
          open
            ? "opacity-100 duration-[160ms] ease-out pointer-events-auto"
            : "opacity-0 duration-100 pointer-events-none"
        )}
      />

      {/* Drawer panel — translateX(-100%)→0 entrance */}
      <div
        id="mobile-drawer"
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={cn(
          "fixed left-0 top-0 bottom-0 z-50",
          "w-[280px] max-w-[85vw]",
          "flex flex-col bg-background border-r border-border shadow-2xl",
          "md:hidden", // only present below 768px
          "transition-transform",
          open
            ? "translate-x-0 duration-[160ms] ease-out"
            : "-translate-x-full duration-100"
        )}
      >
        {/* Header: team switcher + close — first focusable = team switcher */}
        <MobileDrawerHeader team={team} onClose={onClose} />

        {/* Nav content */}
        <nav
          aria-label="Main navigation"
          className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5"
        >
          <SidebarNavItem icon={LayoutDashboard} label="Dashboard" href="/dashboard" />
          <SidebarNavItem icon={Video} label="Meetings" href="/meetings" />
          <SidebarNavItem icon={CheckCircle2} label="Commitments" href="/commitments" />
          <SidebarNavItem icon={ListTodo} label="Action Items" href="/action-items" />
          <SidebarNavItem icon={Users} label="Team" href="/team" />
          <SidebarNavItem icon={BarChart3} label="Analytics" href="/analytics" />

          <Separator className="my-2 bg-border" />

          <SidebarNavItem icon={Sparkles} label="Intelligence" href="/intelligence" />

          <Separator className="my-2 bg-border" />

          <SidebarNavItem icon={Settings} label="Settings" href="/settings" />
        </nav>
      </div>
    </>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

const FOCUSABLE_SELECTORS = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

function getFocusableElements(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTORS)).filter(
    (el) => !el.closest("[aria-hidden='true']") && (el as HTMLElement).offsetParent !== null
  );
}
