import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { createCheckoutSession } from "../api/billing.api";

type CheckoutState = "idle" | "redirecting" | "error";

interface UseCheckoutReturn {
  startCheckout: (priceId: string) => void;
  checkoutState: CheckoutState;
  checkoutError: string | null;
}

/**
 * useCheckout — creates a Stripe Checkout session and redirects.
 * Same label-swap + disable pattern as useBillingPortal (plan §4.7 Selection).
 * Idempotency-Key scoped to priceId + timestamp.
 */
export function useCheckout(): UseCheckoutReturn {
  const teamId = useAuthStore((state) => state.user?.teamId) || "";
  const [checkoutState, setCheckoutState] = useState<CheckoutState>("idle");
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: ({ priceId, key }: { priceId: string; key: string }) =>
      createCheckoutSession(teamId, priceId, key),
    onMutate: () => {
      setCheckoutState("redirecting");
      setCheckoutError(null);
    },
    onSuccess: (url) => {
      window.location.href = url;
    },
    onError: (err: any) => {
      setCheckoutState("error");
      setCheckoutError(
        err?.response?.data?.error?.message ||
          "Couldn't start checkout — please try again."
      );
      setTimeout(() => setCheckoutState("idle"), 200);
    },
  });

  const startCheckout = useCallback(
    (priceId: string) => {
      if (checkoutState !== "idle") return;
      const key = `checkout-${teamId}-${priceId}-${Date.now()}`;
      mutation.mutate({ priceId, key });
    },
    [checkoutState, teamId, mutation]
  );

  return { startCheckout, checkoutState, checkoutError };
}
