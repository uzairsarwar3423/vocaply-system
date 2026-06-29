"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useLogout } from "@/features/auth/hooks/useLogout";
import { Sparkles, LogOut, ArrowRight } from "lucide-react";
import { OnboardingStepShell } from "@/features/onboarding/components/OnboardingStepShell";
import { Button } from "@/components/ui/button";

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { mutate: logout, isPending: isLoggingOut } = useLogout();
  const [isExiting, setIsExiting] = useState(false);

  const handleNext = () => {
    setIsExiting(true);
    setTimeout(() => {
      router.push("/onboarding/create-team");
    }, 100);
  };

  return (
    <OnboardingStepShell
      title={`Welcome, ${user?.name || "there"}!`}
      description="Let's get your workspace set up in just a few quick steps so you can start tracking meeting commitments automatically."
      isExiting={isExiting}
    >
      <div className="space-y-6">
        <div className="flex items-start gap-3 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800/60 rounded-xl p-4">
          <div className="h-8 w-8 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-950 flex items-center justify-center shrink-0 mt-0.5">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="space-y-1">
            <h4 className="text-xs font-semibold text-foreground">Account Verified</h4>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              You've successfully signed up and verified your credentials. Let's create your team workspace now.
            </p>
          </div>
        </div>

        <Button
          onClick={handleNext}
          className="w-full flex items-center justify-center gap-1.5 h-10 font-sans text-xs font-medium"
        >
          <span>{user?.teamId ? "Continue Setup" : "Set Up Team Workspace"}</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>

        <div className="pt-2 flex items-center justify-center">
          <button
            onClick={() => logout()}
            disabled={isLoggingOut}
            className="text-xs font-medium text-zinc-500 hover:text-foreground hover:underline flex items-center gap-1.5 focus:outline-none cursor-pointer transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            {isLoggingOut ? "Logging out..." : "Sign out"}
          </button>
        </div>
      </div>
    </OnboardingStepShell>
  );
}
