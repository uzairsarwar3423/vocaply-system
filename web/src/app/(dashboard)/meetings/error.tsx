"use client";

import { useEffect } from "react";
import { RouteErrorFallback } from "@/shared/components/feedback/RouteErrorFallback";

interface MeetingsErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function MeetingsError({ error, reset }: MeetingsErrorProps) {
  useEffect(() => {
    console.error("[meetings] page crash:", error);
  }, [error]);

  return <RouteErrorFallback error={error} reset={reset} context="Meetings" />;
}

