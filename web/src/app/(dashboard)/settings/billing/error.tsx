"use client";

import { useEffect } from "react";
import { RouteErrorFallback } from "@/shared/components/feedback/RouteErrorFallback";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function BillingSettingsError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("[settings/billing] page crash:", error);
  }, [error]);

  return <RouteErrorFallback error={error} reset={reset} context="Billing settings" />;
}
