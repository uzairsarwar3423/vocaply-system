"use client";

import { useEffect } from "react";
import { RouteErrorFallback } from "@/shared/components/feedback/RouteErrorFallback";

interface DashboardErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DashboardError({ error, reset }: DashboardErrorProps) {
  useEffect(() => {
    console.error("[dashboard] page crash:", error);
  }, [error]);

  return <RouteErrorFallback error={error} reset={reset} context="your dashboard" />;
}

