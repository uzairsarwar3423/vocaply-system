import { useState, useCallback } from "react";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { downloadInvoicePdf } from "../api/billing.api";

type DownloadState = "idle" | "fetching" | "error";

interface UseDownloadInvoiceReturn {
  download: (invoiceId: string, invoiceNumber: string) => Promise<void>;
  /** Per-invoice state map: invoiceId → DownloadState */
  stateFor: (invoiceId: string) => DownloadState;
  /** Per-invoice error message, auto-dismissed after 4s (plan §4.6) */
  errorFor: (invoiceId: string) => string | null;
}

/**
 * useDownloadInvoice — inline state management for invoice PDF downloads.
 * States: idle → fetching (icon dims to 50% opacity, no spinner) → idle on success.
 * Failure: inline tooltip-style error, auto-dismissed after 4s (plan §4.6).
 */
export function useDownloadInvoice(): UseDownloadInvoiceReturn {
  const teamId = useAuthStore((state) => state.user?.teamId) || "";
  const [states, setStates] = useState<Record<string, DownloadState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const download = useCallback(
    async (invoiceId: string, invoiceNumber: string) => {
      setStates((prev) => ({ ...prev, [invoiceId]: "fetching" }));
      setErrors((prev) => {
        const next = { ...prev };
        delete next[invoiceId];
        return next;
      });

      try {
        const blob = await downloadInvoicePdf(teamId, invoiceId);
        // Browser native download dialog takes over — "success" is just reverting to idle
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `invoice-${invoiceNumber}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setStates((prev) => ({ ...prev, [invoiceId]: "idle" }));
      } catch {
        setStates((prev) => ({ ...prev, [invoiceId]: "error" }));
        setErrors((prev) => ({
          ...prev,
          [invoiceId]: "Couldn't download — try again",
        }));
        // Auto-dismiss error after 4s (plan §4.6)
        setTimeout(() => {
          setErrors((prev) => {
            const next = { ...prev };
            delete next[invoiceId];
            return next;
          });
          setStates((prev) => ({ ...prev, [invoiceId]: "idle" }));
        }, 4000);
      }
    },
    [teamId]
  );

  const stateFor = useCallback(
    (invoiceId: string): DownloadState => states[invoiceId] ?? "idle",
    [states]
  );

  const errorFor = useCallback(
    (invoiceId: string): string | null => errors[invoiceId] ?? null,
    [errors]
  );

  return { download, stateFor, errorFor };
}
