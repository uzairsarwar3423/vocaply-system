import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default function NotificationSettingsLoading() {
  return (
    <div className="max-w-[760px] space-y-6">
      <div>
        <div className="h-6 w-48 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-4 w-72 animate-pulse rounded bg-muted" />
      </div>

      <div className="h-12 w-full animate-pulse rounded-lg bg-muted/40" />

      <Card className="border-border/40 bg-card/60">
        <CardHeader className="border-b border-border/40 bg-muted/20">
          <div className="h-5 w-36 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-64 animate-pulse rounded bg-muted" />
        </CardHeader>
        <CardContent className="space-y-4 p-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex items-center justify-between py-4 border-b border-border/20 last:border-0">
              <div className="space-y-2">
                <div className="h-5 w-32 animate-pulse rounded bg-muted" />
                <div className="h-4 w-56 animate-pulse rounded bg-muted" />
              </div>
              <div className="flex gap-12 mr-10">
                <div className="h-6 w-10 animate-pulse rounded-full bg-muted" />
                <div className="h-6 w-10 animate-pulse rounded-full bg-muted" />
                <div className="h-6 w-10 animate-pulse rounded-full bg-muted" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
