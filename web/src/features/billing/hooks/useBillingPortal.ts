import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/shared/lib/cache/query-keys";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { createBillingPortalSession } from "../api/billing.api";

type PortalButtonState = "idle" | "redirecting" | "error";

interface UseBillingPortalReturn {
  openPortal: () => void;
  buttonState: PortalButtonState;
  inlineError: string | null;
}

/**
 * useBillingPortal — creates a Stripe portal session and redirects.
 *
 * Key safety rules (plan §4.4):
 * 1. Button disables instantly on click — prevents double-click creating two sessions.
 * 2. Idempotency-Key on the mutation — second line of defense; network retry safe.
 * 3. Full-tab redirect (window.location.href) — never popup, never iframe.
 * 4. Failure: button re-enables, label reverts, row-anchored inline error appears.
 */
export function useBillingPortal(): UseBillingPortalReturn {
  const teamId = useAuthStore((state) => state.user?.teamId) || "";
  const [buttonState, setButtonState] = useState<PortalButtonState>("idle");
  const [inlineError, setInlineError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const idempotencyKey = `portal-${teamId}-${Date.now()}`;
      return createBillingPortalSession(teamId, idempotencyKey);
    },
    onMutate: () => {
      setButtonState("redirecting");
      setInlineError(null);
    },
    onSuccess: (url) => {
      window.location.href = url;
      // Note: buttonState stays "redirecting" until navigation completes.
    },
    onError: (err: any) => {
      setButtonState("error");
      setInlineError(
        err?.response?.data?.error?.message ||
          "Couldn't open billing portal — please try again."
      );
      // Re-enable the button
      setTimeout(() => setButtonState("idle"), 200);
    },
  });

  const openPortal = useCallback(() => {
    if (buttonState !== "idle") return;
    mutation.mutate();
  }, [buttonState, mutation]);

  return { openPortal, buttonState, inlineError };
}
