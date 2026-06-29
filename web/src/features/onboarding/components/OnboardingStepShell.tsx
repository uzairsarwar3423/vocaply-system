"use client";

import React from "react";
import { motion } from "framer-motion";

interface OnboardingStepShellProps {
  title: string;
  description: string;
  children: React.ReactNode;
  isExiting?: boolean;
}

export function OnboardingStepShell({
  title,
  description,
  children,
  isExiting = false,
}: OnboardingStepShellProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={
        isExiting
          ? { opacity: 0, y: -4 }
          : { opacity: 1, y: 0 }
      }
      transition={
        isExiting
          ? { duration: 0.1, ease: "easeOut" }
          : { duration: 0.14, ease: "easeOut" }
      }
      className="w-full max-w-[480px] mx-auto flex flex-col pt-12 pb-16"
    >
      <div className="space-y-1.5 mb-8">
        <h1 className="font-heading font-semibold text-xl tracking-tight text-foreground select-none">
          {title}
        </h1>
        <p className="font-sans text-[13px] text-muted-foreground leading-5 select-none">
          {description}
        </p>
      </div>
      {children}
    </motion.div>
  );
}
