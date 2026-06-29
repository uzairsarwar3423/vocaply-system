"use client";

import React, { Suspense, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { IntegrationsGrid } from "@/features/integrations/components/IntegrationsGrid";
import { IntegrationsGridSkeleton } from "@/features/integrations/components/IntegrationsGridSkeleton";
import { toast } from "sonner";

function IntegrationsGridWrapper() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");

    if (connected) {
      const providerName = connected.charAt(0) + connected.slice(1).toLowerCase().replace("_calendar", " Calendar");
      toast.success(`${providerName} connected successfully!`);
      const params = new URLSearchParams(window.location.search);
      params.delete("connected");
      const newQuery = params.toString();
      router.replace(`${window.location.pathname}${newQuery ? `?${newQuery}` : ""}`);
    }

    if (error) {
      toast.error(`Connection failed: ${error.replace(/_/g, " ")}`);
      const params = new URLSearchParams(window.location.search);
      params.delete("error");
      const newQuery = params.toString();
      router.replace(`${window.location.pathname}${newQuery ? `?${newQuery}` : ""}`);
    }
  }, [searchParams, router]);

  return <IntegrationsGrid />;
}

export default function IntegrationsSettingsPage() {
  return (
    <Suspense fallback={<IntegrationsGridSkeleton />}>
      <IntegrationsGridWrapper />
    </Suspense>
  );
}
