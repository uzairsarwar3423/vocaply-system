import { useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { queryKeys } from "@/shared/lib/cache/query-keys";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { fetchInvoices } from "../api/billing.api";
import type { InvoiceListResponse } from "../types";

/**
 * useInvoices — cursor-paginated invoice list.
 * First page is pre-fetched RSC-side; client uses this hook to "Load more".
 * Invoices are a bounded, deliberate-browsing list — cursor pagination,
 * NOT infinite scroll (per plan §3: "not a feed").
 */
export function useInvoices() {
  const teamId = useAuthStore((state) => state.user?.teamId) || "";

  return useInfiniteQuery<InvoiceListResponse, Error>({
    queryKey: queryKeys.billing.invoices(teamId),
    queryFn: ({ pageParam }) =>
      fetchInvoices(teamId, pageParam as string | undefined),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined,
    initialPageParam: undefined,
    enabled: !!teamId,
    staleTime: 60 * 1000,
  });
}
