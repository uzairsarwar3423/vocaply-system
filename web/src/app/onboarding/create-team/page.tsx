"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useCreateTeamStep } from "@/features/onboarding/hooks/useCreateTeamStep";
import { OnboardingStepShell } from "@/features/onboarding/components/OnboardingStepShell";
import { OnboardingStepFooter } from "@/features/onboarding/components/OnboardingStepFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

export default function CreateTeamPage() {
  const router = useRouter();
  const [isExiting, setIsExiting] = useState(false);

  const {
    name,
    setName,
    slug,
    setSlug,
    slugStatus,
    suggestion,
    error,
    isSubmitting,
    isCheckingSlug,
    hasTeam,
    acceptSuggestion,
    handleSubmit,
  } = useCreateTeamStep(() => {
    setIsExiting(true);
    setTimeout(() => {
      router.push("/onboarding/invite-team");
    }, 100);
  });

  return (
    <OnboardingStepShell
      title={hasTeam ? "Update team workspace" : "Create team workspace"}
      description="Your workspace URL is where your team will log in and access shared meeting recordings and summaries."
      isExiting={isExiting}
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 text-xs font-medium text-foreground bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 select-none"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-foreground" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="team-name" className="text-xs font-semibold text-muted uppercase tracking-wider">
            Team Name
          </label>
          <Input
            id="team-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Corp"
            className="h-10 text-sm font-sans"
            disabled={isSubmitting}
            autoFocus
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="team-slug" className="text-xs font-semibold text-muted uppercase tracking-wider">
            Workspace URL Slug
          </label>
          <div className="flex items-center relative">
            <span className="absolute left-3 text-xs font-mono text-muted-foreground/60 select-none">
              vocaply.com/teams/
            </span>
            <input
              id="team-slug"
              type="text"
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="acme-corp"
              className="h-10 w-full rounded-md border border-zinc-200 bg-transparent pl-[118px] pr-3 text-sm font-mono transition-all outline-none placeholder:text-zinc-400 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:placeholder:text-zinc-500"
              disabled={isSubmitting}
            />
          </div>

          {/* Advisory Checks (Text-Only Status Indicators) */}
          <div className="min-h-5 pt-1.5 flex items-center select-none text-[11px] font-sans font-medium text-muted-foreground/80 leading-relaxed">
            {slugStatus === "checking" && (
              <span>Checking URL availability…</span>
            )}
            {slugStatus === "available" && (
              <span>URL is available</span>
            )}
            {slugStatus === "taken" && (
              <div className="flex items-center gap-1">
                <span>URL is taken. Try </span>
                <button
                  type="button"
                  onClick={() => suggestion && acceptSuggestion(suggestion)}
                  className="underline text-foreground hover:text-foreground font-semibold"
                >
                  {suggestion}
                </button>
              </div>
            )}
            {slugStatus === "invalid" && (
              <span>URL must be alphanumeric with hyphens only</span>
            )}
          </div>
        </div>

        <OnboardingStepFooter>
          <Link
            href="/onboarding"
            className="text-xs font-sans text-muted-foreground hover:text-foreground hover:underline font-medium h-9 flex items-center"
          >
            Back
          </Link>
          <Button
            type="submit"
            disabled={isSubmitting || slugStatus === "checking" || slugStatus === "invalid" || (!hasTeam && slugStatus !== "available")}
            className="h-10 px-5 text-xs font-medium min-w-[120px]"
          >
            {isSubmitting ? "Saving…" : "Continue →"}
          </Button>
        </OnboardingStepFooter>
      </form>
    </OnboardingStepShell>
  );
}
