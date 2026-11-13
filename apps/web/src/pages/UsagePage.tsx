import { Activity } from 'lucide-react';
import { Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui';
import { BarChart } from '@/features/admin/BarChart';
import { ProviderUsageCard } from '@/features/admin/ProviderUsageCard';
import { StatTile } from '@/features/admin/StatTile';
import { useAdminUsageQuery } from '@/store/api';
import { formatNumber } from '@/utils/format';

function LoadingState() {
  return (
    <div className="space-y-6" aria-busy aria-label="Loading API usage">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="mt-3 h-6 w-1/3" />
          </Card>
        ))}
      </div>
      <Card className="p-5">
        <Skeleton className="h-36 w-full rounded-xl" />
      </Card>
    </div>
  );
}

export default function UsagePage() {
  const usage = useAdminUsageQuery();
  const data = usage.data;

  return (
    <div className="animate-slide-up">
      <PageHeader
        title="API usage"
        description="How the shared provider keys and the whole server are being used."
        icon={<Activity size={20} aria-hidden />}
      />

      {!data ? (
        usage.isError ? (
          <ErrorState error={usage.error} onRetry={() => void usage.refetch()} />
        ) : (
          <LoadingState />
        )
      ) : (
        <div className="space-y-8">
          <section aria-label="Totals" className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Translations today" value={formatNumber(data.translations.today)} hint="All accounts" />
              <StatTile label="Translations this month" value={formatNumber(data.translations.thisMonth)} hint="All accounts" />
              <StatTile label="Total users" value={formatNumber(data.totalUsers)} hint="Including you" />
              <StatTile label="Active today" value={formatNumber(data.activeUsersToday)} hint="Used a translation today" />
            </div>
            <Card>
              <CardHeader title="Translations" description="All accounts, last 14 days." />
              <div className="p-5">
                <BarChart data={data.translations.daily} label="Translations per day" />
              </div>
            </Card>
          </section>

          <section aria-labelledby="providers-heading" className="space-y-4">
            <div>
              <h2 id="providers-heading" className="text-[16px] font-semibold tracking-tight text-fg">
                Shared provider keys
              </h2>
              <p className="text-[13px] text-muted">Providers that are ready or were used in the last 14 days.</p>
            </div>
            {data.providers.length === 0 ? (
              <Card>
                <EmptyState
                  icon={Activity}
                  title="No provider has been used yet"
                  description="Once a shared key answers a translation, its usage shows up here."
                />
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {data.providers.map((report) => (
                  <ProviderUsageCard key={report.id} report={report} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
