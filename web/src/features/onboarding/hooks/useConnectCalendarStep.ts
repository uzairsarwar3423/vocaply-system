import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useOAuthConnect } from "@/features/integrations/hooks/useOAuthConnect";

export const useConnectCalendarStep = (onSuccess: () => void) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { connect, connectingProvider } = useOAuthConnect();
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Query configuration state from backend
  const { data: configData, isLoading: isLoadingConfig } = useQuery({
    queryKey: ["auth", "google-calendar-config"],
    queryFn: async () => {
      const res = await api.get<{ data: { configured: boolean } }>(
        "/auth/google-calendar/check-config"
      );
      return res.data.data;
    },
    staleTime: Infinity,
  });

  const isConfigured = configData?.configured ?? true;

  const [hasProcessed, setHasProcessed] = useState(false);

  // Watch for ?connected=true or ?error=oauth_failed
  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");

    if (connected === "true" && !hasProcessed) {
      setHasProcessed(true);
      const params = new URLSearchParams(window.location.search);
      params.delete("connected");
      const cleanPath = `${window.location.pathname}${
        params.toString() ? `?${params.toString()}` : ""
      }`;
      router.replace(cleanPath);

      // Auto advance
      onSuccess();
    } else if (error && !hasProcessed) {
      setHasProcessed(true);
      const params = new URLSearchParams(window.location.search);
      params.delete("error");
      const cleanPath = `${window.location.pathname}${
        params.toString() ? `?${params.toString()}` : ""
      }`;
      router.replace(cleanPath);
    }
  }, [searchParams, router, onSuccess, hasProcessed]);

  const handleConnect = async () => {
    if (!isConfigured) return;
    setIsRedirecting(true);
    setTimeout(async () => {
      try {
        await connect("GOOGLE_CALENDAR");
      } catch (err) {
        setIsRedirecting(false);
      }
    }, 150);
  };

  const isConnecting = isRedirecting || connectingProvider === "GOOGLE_CALENDAR";

  return {
    isConfigured,
    isLoadingConfig,
    isConnecting,
    handleConnect,
  };
};
