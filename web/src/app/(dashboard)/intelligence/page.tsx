import { PageContainer } from "@/components/shared/layout/PageContainer";
import { PageHeader } from "@/components/shared/layout/PageHeader";

/**
 * Intelligence page stub — Day 45
 * Activates error.tsx and loading.tsx boundaries.
 * AI pipeline ships Phase 4 (Day 46+).
 */
export default function IntelligencePage() {
  return (
    <PageContainer>
      <PageHeader
        title="Intelligence"
        subtitle="AI-powered insights from your meetings and commitments."
      />
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center border border-dashed border-border/60 rounded-2xl bg-surface/30 mt-6">
        <p className="font-sans text-sm font-medium text-foreground">Intelligence</p>
        <p className="font-sans text-xs text-muted-foreground mt-1 max-w-sm">
          AI pipeline ships in Phase 4. Error and loading boundaries are active now.
        </p>
      </div>
    </PageContainer>
  );
}
