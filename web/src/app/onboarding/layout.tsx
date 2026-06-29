"use client";

import type { ReactNode } from "react";
import { AuthGuard } from "@/features/auth/components/AuthGuard";
import { useOnboardingStepGuard } from "@/features/onboarding/hooks/useOnboardingStepGuard";
import { OnboardingProgress } from "@/features/onboarding/components/OnboardingProgress";

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  // Enforce step guard to protect access and handle completions
  useOnboardingStepGuard();

  return (
    <AuthGuard>
      <div className="min-h-screen w-full flex flex-col bg-zinc-50 dark:bg-zinc-950 text-foreground transition-colors duration-300 onboarding-theme">
        {/* Simple Clean Header */}
        <header className="w-full max-w-lg mx-auto px-6 pt-8 pb-4 flex items-center justify-between select-none">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center text-zinc-50 dark:text-zinc-950 font-bold text-sm">
              V
            </div>
            <span className="font-semibold text-sm tracking-tight text-foreground">Vocaply</span>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col items-center justify-center px-4 py-8">
          <div className="w-full max-w-[480px]">
            {/* Onboarding Container Card */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/80 rounded-2xl p-6 sm:p-8 shadow-sm relative overflow-hidden transition-all duration-300">
              {/* Progress bar at the top of the card */}
              <div className="mb-6">
                <OnboardingProgress />
              </div>
              
              <div>
                {children}
              </div>
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
