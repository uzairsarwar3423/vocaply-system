import React from "react";

interface OnboardingStepFooterProps {
  children: React.ReactNode;
}

export function OnboardingStepFooter({ children }: OnboardingStepFooterProps) {
  return (
    <div className="flex items-center justify-between mt-8 border-t border-zinc-100 dark:border-zinc-900 pt-6 gap-4">
      {children}
    </div>
  );
}
