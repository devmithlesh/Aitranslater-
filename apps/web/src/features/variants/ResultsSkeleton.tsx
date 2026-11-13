import { Card, Skeleton } from '@/components/ui';

const TAB_PLACEHOLDERS = 6;

/** Loading placeholder with the same shape as VariantResults. */
export function ResultsSkeleton() {
  return (
    <Card className="overflow-hidden" aria-busy>
      <div className="flex gap-3 border-b border-border px-4 py-3.5">
        {Array.from({ length: TAB_PLACEHOLDERS }, (_, i) => (
          <Skeleton key={i} className="w-16 shrink-0" />
        ))}
      </div>
      <div className="min-h-[220px] space-y-3 p-5">
        <Skeleton className="w-11/12" />
        <Skeleton className="w-3/4" />
        <Skeleton className="w-1/2" />
      </div>
      <div className="space-y-2 border-t border-border px-5 py-4">
        <Skeleton className="w-24" />
        <Skeleton className="w-4/5" />
      </div>
    </Card>
  );
}
