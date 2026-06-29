"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useOnboarding } from "@/features/onboarding/hooks/useOnboarding";
import { motion } from "framer-motion";

export default function OnboardingCompletePage() {
  const router = useRouter();
  const { user, isLoading, isAuthenticated } = useAuth();
  const { completeOnboarding } = useOnboarding();
  const [statusText, setStatusText] = useState("Preparing your workspace…");
  const [errorOccurred, setErrorOccurred] = useState(false);
  const hasTriggered = useRef(false);

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }

    let isMounted = true;
    const timers: NodeJS.Timeout[] = [];

    const startRedirectSequence = () => {
      if (!isMounted) return;
      setStatusText("Preparing your workspace…");
      
      const t1 = setTimeout(() => {
        if (isMounted) setStatusText("Redirecting…");
      }, 800);

      const t2 = setTimeout(() => {
        if (isMounted) router.replace("/dashboard");
      }, 1500);

      timers.push(t1, t2);
    };

    const triggerComplete = async () => {
      if (hasTriggered.current) return;
      hasTriggered.current = true;
      
      setStatusText("Finishing setup…");
      try {
        await completeOnboarding();
        startRedirectSequence();
      } catch (err) {
        if (isMounted) {
          setErrorOccurred(true);
          setStatusText("Failed to complete setup. Please try refreshing.");
        }
      }
    };

    if (user?.onboardingCompleted) {
      startRedirectSequence();
    } else {
      triggerComplete();
    }

    return () => {
      isMounted = false;
      timers.forEach(clearTimeout);
    };
  }, [user, isLoading, isAuthenticated, router, completeOnboarding]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      className="min-h-screen w-full flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 text-foreground"
    >
      <div className="flex flex-col items-center space-y-4 max-w-sm text-center px-6 select-none">
        <div className="h-10 w-10 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-950 flex items-center justify-center font-bold text-base shadow-sm">
          V
        </div>
        <div className="space-y-1">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            Workspace is ready
          </h2>
          <p className="text-xs font-medium text-muted-foreground/80 font-sans h-4">
            {statusText}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
