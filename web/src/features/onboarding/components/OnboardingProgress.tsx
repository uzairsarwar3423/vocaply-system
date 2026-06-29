"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { ONBOARDING_STEPS } from "../data/onboarding-steps.config";

export function OnboardingProgress() {
  const pathname = usePathname();

  const currentStep = ONBOARDING_STEPS.find((s) => s.path === pathname) || ONBOARDING_STEPS[0];
  const current = currentStep.order;
  const total = ONBOARDING_STEPS.length;
  const percentage = (current / total) * 100;

  return (
    <div className="w-full flex flex-col gap-2 select-none">
      <div className="flex justify-between items-center text-[10px] font-sans font-medium text-muted-foreground/60 tracking-wider uppercase">
        <span>{currentStep.label}</span>
        <span className="font-poppins font-medium text-[10px] tracking-tight tabular-nums">
          Step {current} of {total}
        </span>
      </div>
      <div className="w-full h-[2px] bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.14, ease: "easeOut" }}
          className="h-full bg-zinc-900 dark:bg-zinc-100"
        />
      </div>
    </div>
  );
}
