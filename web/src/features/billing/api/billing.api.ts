// ─────────────────────────────────────────────────────────────────────────────
// Vocaply — features/billing/api/billing.api.ts
// REST API calls for billing domain.
// ─────────────────────────────────────────────────────────────────────────────

import axios from "axios";
import type { Subscription, UsageSummary, Invoice, InvoiceListResponse } from "../types";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000",
  withCredentials: true,
});

// ── Subscription ──────────────────────────────────────────────────────────────

export async function fetchSubscription(teamId: string): Promise<Subscription> {
  const { data } = await api.get(`/api/v1/teams/${teamId}/billing/subscription`);
  return data.subscription;
}

// ── Usage ─────────────────────────────────────────────────────────────────────

export async function fetchUsage(teamId: string): Promise<UsageSummary> {
  const { data } = await api.get(`/api/v1/teams/${teamId}/billing/usage`);
  return data.usage;
}

// ── Invoices ──────────────────────────────────────────────────────────────────

export async function fetchInvoices(
  teamId: string,
  cursor?: string
): Promise<InvoiceListResponse> {
  const params = cursor ? { cursor } : {};
  const { data } = await api.get(`/api/v1/teams/${teamId}/billing/invoices`, {
    params,
  });
  return data;
}

export async function downloadInvoicePdf(
  teamId: string,
  invoiceId: string
): Promise<Blob> {
  const { data } = await api.get(
    `/api/v1/teams/${teamId}/billing/invoices/${invoiceId}/pdf`,
    { responseType: "blob" }
  );
  return data;
}

// ── Portal ────────────────────────────────────────────────────────────────────

export async function createBillingPortalSession(
  teamId: string,
  idempotencyKey: string
): Promise<string> {
  const { data } = await api.post(
    `/api/v1/teams/${teamId}/billing/portal`,
    {},
    {
      headers: { "Idempotency-Key": idempotencyKey },
    }
  );
  return data.url;
}

// ── Checkout ──────────────────────────────────────────────────────────────────

export async function createCheckoutSession(
  teamId: string,
  priceId: string,
  idempotencyKey: string
): Promise<string> {
  const { data } = await api.post(
    `/api/v1/teams/${teamId}/billing/checkout`,
    { priceId },
    {
      headers: { "Idempotency-Key": idempotencyKey },
    }
  );
  return data.url;
}

// ── Cancel ────────────────────────────────────────────────────────────────────

export async function cancelSubscription(teamId: string): Promise<void> {
  await api.post(`/api/v1/teams/${teamId}/billing/cancel`);
}
