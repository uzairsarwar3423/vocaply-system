import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/shared/lib/cache/query-keys";
import { PLAN_PRICING, PLAN_FEATURES } from "../data/plan-features.config";

/**
 * usePlans — returns static plan data as a TanStack Query.
 * Data lives in plan-features.config.ts; query wraps it for cache-friendly access
 * (Infinity staleTime — this data only changes on deploy).
 */
export function usePlans() {
  return useQuery({
    queryKey: queryKeys.billing.plans(),
    queryFn: () => ({ pricing: PLAN_PRICING, features: PLAN_FEATURES }),
    staleTime: Infinity,
  });
}
