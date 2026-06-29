"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface UsageThresholdLinkProps {
  upgradeUrl?: string;
  /** Controls visibility — reserved slot to avoid layout shift (plan §4.2) */
  visible: boolean;
}

/**
 * UsageThresholdLink — the "· Upgrade →" inline link at ≥90% usage.
 *
 * Layout rule (plan §4.2): slot is ALWAYS rendered, just opacity 0 below threshold.
 * This prevents the fraction text from jumping right when the link appears.
 * Uses min-width to reserve space. A 120ms opacity fade on threshold crossing.
 */
export function UsageThresholdLink({ upgradeUrl = "/settings/billing", visible }: UsageThresholdLinkProps) {
  return (
    <a
      href={upgradeUrl}
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      className={cn(
        "text-[12px] font-sans font-medium text-muted-foreground whitespace-nowrap",
        "transition-opacity duration-[120ms]",
        "hover:text-foreground hover:underline focus:outline-none focus-visible:underline",
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      )}
    >
      {" · "}Upgrade →
    </a>
  );
}
