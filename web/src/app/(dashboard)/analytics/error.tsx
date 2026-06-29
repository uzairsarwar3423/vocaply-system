"use client";

import { useEffect } from "react";
import { RouteErrorFallback } from "@/shared/components/feedback/RouteErrorFallback";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AnalyticsError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("[analytics] page crash:", error);
  }, [error]);

  return <RouteErrorFallback error={error} reset={reset} context="Analytics" />;
}
