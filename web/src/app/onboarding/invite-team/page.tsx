"use client";

import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useInviteTeamStep } from "@/features/onboarding/hooks/useInviteTeamStep";
import { OnboardingStepShell } from "@/features/onboarding/components/OnboardingStepShell";
import { OnboardingStepFooter } from "@/features/onboarding/components/OnboardingStepFooter";
import { OnboardingSkipConfirm } from "@/features/onboarding/components/OnboardingSkipConfirm";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { AlertCircle, ChevronDown, Check, Mail } from "lucide-react";

const ROLES = [
  { value: "MEMBER", label: "Member", desc: "Can view and comment" },
  { value: "MANAGER", label: "Manager", desc: "Can manage members" },
  { value: "ADMIN", label: "Admin", desc: "Full workspace access" },
] as const;

export default function InviteTeamPage() {
  const router = useRouter();
  const [isExiting, setIsExiting] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleNext = () => {
    setIsExiting(true);
    setTimeout(() => {
      router.push("/onboarding/connect-calendar");
    }, 100);
  };

  const {
    emails,
    inputValue,
    setInputValue,
    role,
    setRole,
    error,
    isLastChipHighlighted,
    inviteResults,
    isInviting,
    removeEmail,
    handleKeyDown,
    handleSubmit,
    isValidEmail,
  } = useInviteTeamStep(handleNext);

  const selectedRole = ROLES.find((r) => r.value === role)!;

  const handleContainerClick = () => {
    inputRef.current?.focus();
  };

  // If we have invite results, show the post-submit read-only feedback screen
  if (inviteResults) {
    const totalInvited = [
      ...inviteResults.invited,
      ...inviteResults.alreadyInvited,
      ...inviteResults.alreadyMember,
    ];

    return (
      <OnboardingStepShell
        title="Invitations Sent"
        description="Here is the status of the invitations processed for your workspace."
        isExiting={isExiting}
      >
        <div className="space-y-6">
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl divide-y divide-zinc-100 dark:divide-zinc-900 overflow-hidden select-none">
            {totalInvited.map((email) => (
              <div key={email} className="flex items-center justify-between p-3.5 bg-zinc-50/50 dark:bg-zinc-900/30">
                <span className="text-xs font-sans font-medium text-foreground truncate max-w-[280px]">
                  {email}
                </span>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground/80 font-sans font-medium">
                  <Check className="h-3.5 w-3.5 text-zinc-800 dark:text-zinc-200 shrink-0" />
                  <span>
                    {inviteResults.alreadyMember.includes(email)
                      ? "Already member"
                      : inviteResults.alreadyInvited.includes(email)
                      ? "Already invited"
                      : `Invited as ${role.toLowerCase()}`}
                  </span>
                </div>
              </div>
            ))}

            {inviteResults.failed.map((email) => (
              <div key={email} className="flex items-center justify-between p-3.5">
                <span className="text-xs font-sans font-medium text-muted-foreground truncate max-w-[280px]">
                  {email}
                </span>
                <span className="text-xs text-muted-foreground/60 font-sans font-medium">
                  Failed to invite
                </span>
              </div>
            ))}
          </div>

          <OnboardingStepFooter>
            <div />
            <Button
              onClick={handleNext}
              className="h-10 px-5 text-xs font-medium min-w-[120px]"
            >
              Continue →
            </Button>
          </OnboardingStepFooter>
        </div>
      </OnboardingStepShell>
    );
  }

  return (
    <OnboardingStepShell
      title="Invite your teammates"
      description="Add coworkers to your team. They'll receive an email invite to join your workspace and track commitments together."
      isExiting={isExiting}
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 text-xs font-medium text-foreground bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 select-none"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted uppercase tracking-wider select-none">
            Teammate Emails
          </label>
          <div
            onClick={handleContainerClick}
            className="min-h-24 w-full rounded-md border border-zinc-200 bg-transparent px-3 py-2 text-sm transition-all focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20 dark:border-zinc-800 cursor-text flex flex-wrap gap-1.5 items-start content-start"
          >
            {emails.map((email, idx) => {
              const isValid = isValidEmail(email);
              const isHighlighted = idx === emails.length - 1 && isLastChipHighlighted;
              return (
                <span
                  key={idx}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs select-none font-sans transition-all",
                    isValid
                      ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-transparent"
                      : "border border-zinc-300 dark:border-zinc-700 text-muted-foreground",
                    isHighlighted && "ring-2 ring-zinc-500 dark:ring-zinc-400"
                  )}
                >
                  <span className="truncate max-w-[150px]">{email}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeEmail(idx);
                    }}
                    className="text-muted-foreground/60 hover:text-foreground text-[11px] font-bold leading-none"
                  >
                    ×
                  </button>
                </span>
              );
            })}
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={emails.length === 0 ? "colleague@company.com" : ""}
              className="bg-transparent border-none outline-none focus:ring-0 text-sm flex-1 min-w-[120px] h-6 py-0 font-sans"
              disabled={isInviting}
            />
          </div>
          <span className="text-[10px] text-muted-foreground/60 select-none font-sans block pt-0.5 leading-normal">
            Press Enter, Space, or Comma to add an email tag chip.
          </span>
        </div>

        {/* Role Assignment Selector */}
        <div className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-100 dark:border-zinc-900 bg-zinc-50/40 dark:bg-zinc-900/20 select-none">
          <div className="space-y-0.5">
            <p className="text-xs font-semibold text-foreground leading-normal">Assign Role</p>
            <p className="text-[11px] text-muted-foreground/60 leading-normal">Role applies to all invited members</p>
          </div>
          <Popover open={roleOpen} onOpenChange={setRoleOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1.5 h-8 px-3 rounded border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 text-xs font-medium text-foreground hover:bg-zinc-50 dark:hover:bg-zinc-800 transition focus:outline-none"
              >
                <span>{selectedRole.label}</span>
                <ChevronDown className={cn("h-3 w-3 text-muted-foreground/75 transition-transform", roleOpen && "rotate-180")} />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={6}
              className="w-48 p-1 rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-md z-[200]"
            >
              {ROLES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => {
                    setRole(r.value);
                    setRoleOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-start gap-2 px-2.5 py-2 rounded text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60",
                    role === r.value && "bg-zinc-50 dark:bg-zinc-800"
                  )}
                >
                  <div className="flex-1">
                    <p className={cn(
                      "text-xs font-medium mb-0.5",
                      role === r.value ? "text-foreground" : "text-muted-foreground"
                    )}>{r.label}</p>
                    <p className="text-[10px] text-muted-foreground/60 leading-normal">{r.desc}</p>
                  </div>
                  {role === r.value && (
                    <Check className="h-3.5 w-3.5 text-zinc-900 dark:text-zinc-100 mt-0.5 shrink-0" />
                  )}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </div>

        <OnboardingStepFooter>
          <OnboardingSkipConfirm onConfirm={handleNext} />
          <Button
            type="submit"
            disabled={isInviting}
            className="h-10 px-5 text-xs font-medium min-w-[120px]"
          >
            {isInviting ? "Sending…" : "Send Invites"}
          </Button>
        </OnboardingStepFooter>
      </form>
    </OnboardingStepShell>
  );
}
