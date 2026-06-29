import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/shared/lib/cache/query-keys";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { fetchSubscription, fetchUsage } from "../api/billing.api";
import type { Subscription, UsageSummary } from "../types";

interface BillingData {
  subscription: Subscription | undefined;
  usage: UsageSummary | undefined;
  isLoading: boolean;
  isError: boolean;
  subscriptionError: Error | null;
  usageError: Error | null;
}

/**
 * useBilling — parallel-fetches subscription + usage.
 * Both queries are independent; a slow usage fetch doesn't block subscription display.
 */
export function useBilling(): BillingData {
  const teamId = useAuthStore((state) => state.user?.teamId) || "";

  const subscriptionQuery = useQuery({
    queryKey: queryKeys.billing.subscription(teamId),
    queryFn: () => fetchSubscription(teamId),
    enabled: !!teamId,
    staleTime: 30 * 1000, // 30s — billing data should feel fresh
  });

  const usageQuery = useQuery({
    queryKey: queryKeys.billing.usage(teamId),
    queryFn: () => fetchUsage(teamId),
    enabled: !!teamId,
    staleTime: 60 * 1000,
  });

  return {
    subscription: subscriptionQuery.data,
    usage: usageQuery.data,
    isLoading: subscriptionQuery.isLoading || usageQuery.isLoading,
    isError: subscriptionQuery.isError || usageQuery.isError,
    subscriptionError: subscriptionQuery.error,
    usageError: usageQuery.error,
  };
}
