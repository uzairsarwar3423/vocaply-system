import { PageContainer } from "@/components/shared/layout/PageContainer";
import { PageHeader } from "@/components/shared/layout/PageHeader";

/**
 * Analytics page stub — Day 45
 * Route exists to ensure error.tsx and loading.tsx boundaries are active.
 * Full analytics implementation ships in Phase 4.
 */
export default function AnalyticsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Analytics"
        subtitle="Meeting and commitment analytics across your workspace."
      />
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center border border-dashed border-border/60 rounded-2xl bg-surface/30 mt-6">
        <p className="font-sans text-sm font-medium text-foreground">Analytics</p>
        <p className="font-sans text-xs text-muted-foreground mt-1 max-w-sm">
          Full analytics dashboard ships in Phase 4. Error and loading boundaries are active now.
        </p>
      </div>
    </PageContainer>
  );
}
