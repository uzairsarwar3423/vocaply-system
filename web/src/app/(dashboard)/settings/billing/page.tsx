import type { Metadata } from 'next';
import { BillingView } from '@/features/billing/components/BillingView';

export const metadata: Metadata = {
  title: 'Billing',
  description: 'Manage your organization plan, billing information, usage, and invoices.',
};

/**
 * BillingSettingsPage — RSC shell (plan §2).
 * Renders BillingView (client component) which fetches subscription + usage
 * in parallel via TanStack Query (hydrated from this RSC boundary).
 *
 * Max-width 760px matching Day 41's Integrations page — locked layout token.
 * Page title: Plus Jakarta Sans 20/600 (plan §1 type scale).
 */
export default function BillingSettingsPage() {
  return (
    <div className="max-w-[760px]">
      {/* Page title — Plus Jakarta Sans 20/600, -0.01em tracking (plan §1) */}
      <h1
        className="font-heading font-semibold text-foreground leading-[28px] tracking-[-0.01em] mb-6"
        style={{ fontSize: "20px" }}
      >
        Billing
      </h1>

      <BillingView />
    </div>
  );
}
