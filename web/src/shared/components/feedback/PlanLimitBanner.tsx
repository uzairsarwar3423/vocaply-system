"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface PlanLimitBannerProps {
  resource: string;
  used: number;
  limit: number;
  upgradeUrl: string;
  /** 'banner' = full-width bar (Sheet context); 'inline-link' = compact inline for UsageRow */
  variant?: "banner" | "inline-link";
}

/**
 * PlanLimitBanner — canonical shared component (plan §6.3).
 *
 * Two visual presentations of the same underlying limit data:
 * - 'banner': full-width, used inside Sheets when an action is blocked (replaced ad hoc versions
 *             in features/meetings/AddMeetingSheet and features/team/InviteMemberSheet).
 * - 'inline-link': compact "· Upgrade →" link, used in UsageProgressRow at ≥90% threshold.
 *
 * NOTE: do NOT force-fit the banner variant into a 24px-tall row — they are intentionally separate.
 */
export function PlanLimitBanner({
  resource,
  used,
  limit,
  upgradeUrl,
  variant = "banner",
}: PlanLimitBannerProps) {
  if (variant === "inline-link") {
    return (
      <a
        href={upgradeUrl}
        className={cn(
          "text-[12px] font-sans font-medium text-muted-foreground",
          "transition-opacity duration-[120ms]",
          "hover:text-foreground hover:underline focus:outline-none focus-visible:underline",
          "whitespace-nowrap"
        )}
        aria-label={`You've used ${used} of ${limit} ${resource}. Upgrade your plan.`}
      >
        {" · "}Upgrade →
      </a>
    );
  }

  // Banner variant
  return (
    <div
      role="alert"
      className={cn(
        "w-full flex items-start gap-3 rounded-lg border px-4 py-3",
        "bg-muted/40 border-border",
        "text-[13px] font-sans"
      )}
    >
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground leading-[20px]">
          {resource} limit reached
        </p>
        <p className="text-muted-foreground leading-[20px] mt-0.5">
          You've used {used} of {limit} {resource.toLowerCase()}.{" "}
          <a
            href={upgradeUrl}
            className="font-medium text-foreground underline underline-offset-2 hover:opacity-80 transition-opacity"
          >
            Upgrade your plan
          </a>{" "}
          to increase your limit.
        </p>
      </div>
    </div>
  );
}
