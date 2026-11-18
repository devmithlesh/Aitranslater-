import { Activity } from 'lucide-react';
import { Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui';
import { StatTile } from '@/features/admin/StatTile';
import { useAdminUsageQuery, useUsersQuery } from '@/store/api';
import { formatNumber } from '@/utils/format';

const TOP_USER_LIMIT = 10;

function StatsRow() {
  const usage = useAdminUsageQuery();
  const data = usage.data;

  if (!data) {
    if (usage.isError) {
      return <ErrorState error={usage.error} onRetry={() => void usage.refetch()} />;
    }
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-busy aria-label="Loading API usage">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="mt-3 h-6 w-1/3" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatTile label="Translations today" value={formatNumber(data.translations.today)} />
      <StatTile label="Translations this month" value={formatNumber(data.translations.thisMonth)} />
      <StatTile
        label="Active users today"
        value={formatNumber(data.activeUsersToday)}
        hint={`of ${formatNumber(data.totalUsers)} users`}
      />
    </div>
  );
}

function TopUsersCard() {
  const users = useUsersQuery();
  const list = users.data;

  let body;
  if (!list) {
    body = users.isError ? (
      <div className="p-5">
        <ErrorState error={users.error} onRetry={() => void users.refetch()} />
      </div>
    ) : (
      <div className="space-y-3 p-5" aria-busy aria-label="Loading top users">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-5 w-full" />
        ))}
      </div>
    );
  } else {
    const ranked = list
      .filter((u) => u.totalUsed > 0)
      .sort((a, b) => b.usedThisMonth - a.usedThisMonth || b.usedToday - a.usedToday)
      .slice(0, TOP_USER_LIMIT);

    body =
      ranked.length === 0 ? (
        <EmptyState icon={Activity} title="No translations yet" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-border text-[12px] text-subtle">
                <th scope="col" className="w-12 px-5 py-2.5 font-medium">#</th>
                <th scope="col" className="px-3 py-2.5 font-medium">User</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Today</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">This month</th>
                <th scope="col" className="px-5 py-2.5 text-right font-medium">All time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ranked.map((u, index) => (
                <tr key={u.id}>
                  <td className="px-5 py-3 tabular-nums text-muted">{index + 1}</td>
                  <td className="min-w-0 px-3 py-3">
                    <p className="break-words font-medium text-fg">{u.name}</p>
                    <p className="break-all text-[12px] text-muted">{u.email}</p>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-fg">{formatNumber(u.usedToday)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-fg">{formatNumber(u.usedThisMonth)}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-fg">{formatNumber(u.totalUsed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }

  return (
    <Card>
      <CardHeader title="Top users" description="Most translations this month." />
      {body}
    </Card>
  );
}

export default function UsagePage() {
  return (
    <div className="animate-slide-up space-y-6">
      <PageHeader
        title="API usage"
        description="How much Verba is being used, and by whom."
        icon={<Activity size={20} aria-hidden />}
      />
      <StatsRow />
      <TopUsersCard />
    </div>
  );
}
