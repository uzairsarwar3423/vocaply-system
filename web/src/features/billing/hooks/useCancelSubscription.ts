import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/shared/lib/cache/query-keys";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { cancelSubscription } from "../api/billing.api";

/**
 * useCancelSubscription — mutation to schedule cancellation at period end.
 * Invalidates subscription query on success so PlanStatusBadge updates immediately
 * to "Cancelling" state.
 */
export function useCancelSubscription() {
  const teamId = useAuthStore((state) => state.user?.teamId) || "";
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => cancelSubscription(teamId),
    onSuccess: () => {
      // Invalidate subscription so the badge flips to "Cancelling" without a page refresh
      queryClient.invalidateQueries({
        queryKey: queryKeys.billing.subscription(teamId),
      });
    },
  });
}
