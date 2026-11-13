import type { ProviderView } from '@verba/shared';
import { AlertTriangle } from 'lucide-react';
import { formatCompact, formatNumber, formatRelative } from '@/utils/format';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-2 px-3 py-2.5">
      <p className="truncate text-[11.5px] text-subtle">{label}</p>
      <p className="mt-0.5 truncate text-[14px] font-semibold tabular-nums text-fg">{value}</p>
    </div>
  );
}

export function ProviderUsage({ provider }: { provider: ProviderView }) {
  const u = provider.usage;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Requests today" value={formatNumber(u.requestsToday)} />
        <Stat label="Characters today" value={formatCompact(u.charsToday)} />
        <Stat label="Requests this month" value={formatNumber(u.requestsThisMonth)} />
        <Stat label="Characters this month" value={formatCompact(u.charsThisMonth)} />
        <Stat label="Average latency" value={u.avgLatencyMs === null ? '—' : `${formatNumber(Math.round(u.avgLatencyMs))} ms`} />
        <Stat label="Last used" value={u.lastUsedAt ? formatRelative(u.lastUsedAt) : 'Never'} />
      </div>
      {u.errorsThisMonth > 0 && (
        <p className="text-[12.5px] text-muted">
          {formatNumber(u.errorsThisMonth)} {u.errorsThisMonth === 1 ? 'error' : 'errors'} this month.
        </p>
      )}
      {provider.lastError && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft p-3 text-[12.5px] text-danger">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
          <span className="min-w-0 break-words">
            Last error {formatRelative(provider.lastError.at)}: {provider.lastError.message}
          </span>
        </p>
      )}
    </div>
  );
}
