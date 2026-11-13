import type { ProviderId, ProviderUsageReport } from '@verba/shared';
import { Pencil } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Badge, Button, Card, CardHeader, SegmentedControl, useToast } from '@/components/ui';
import { errorMessage, useAdminConfigQuery, useUpdateAdminConfigMutation } from '@/store/api';
import { cn } from '@/utils/cn';
import { formatCompact, formatNumber } from '@/utils/format';
import { BarChart } from './BarChart';
import { LimitInput } from './LimitInput';
import { ProgressBar } from './ProgressBar';
import { StatTile } from './StatTile';
import { limitToInput, parseLimitInput } from './limits';

type Metric = 'requests' | 'tokens';

const METRIC_OPTIONS = [
  { value: 'requests', label: 'Requests' },
  { value: 'tokens', label: 'Tokens' },
] as const;

/** One shared provider key: today's quota bar, usage totals and a 14-day chart. */
export function ProviderUsageCard({ report }: { report: ProviderUsageReport }) {
  const toast = useToast();
  const config = useAdminConfigQuery();
  const [updateConfig, { isLoading: saving }] = useUpdateAdminConfigMutation();
  const [metric, setMetric] = useState<Metric>('requests');
  const [editingQuota, setEditingQuota] = useState(false);
  const [quotaDraft, setQuotaDraft] = useState('');
  const [quotaError, setQuotaError] = useState<string | null>(null);

  const u = report.usage;
  // Only LLM providers report tokens; translation providers do not.
  const reportsTokens = report.kind === 'llm';
  const quota = report.dailyQuota;

  function startEditing() {
    setQuotaDraft(limitToInput(quota));
    setQuotaError(null);
    setEditingQuota(true);
  }

  async function saveQuota(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!config.data || saving) return;

    const parsed = parseLimitInput(quotaDraft);
    if (!parsed.ok) {
      setQuotaError(parsed.error);
      return;
    }
    if (parsed.value === 0) {
      setQuotaError('Use at least 1, or leave it empty for no quota.');
      return;
    }

    // The update replaces the whole map, so send every other provider's quota along with this one.
    const next: Partial<Record<ProviderId, number>> = { ...config.data.providerDailyQuotas };
    if (parsed.value === null) delete next[report.id];
    else next[report.id] = parsed.value;

    try {
      await updateConfig({ providerDailyQuotas: next }).unwrap();
      setEditingQuota(false);
      toast.success(`${report.name} quota ${parsed.value === null ? 'removed' : 'saved'}`);
    } catch (err) {
      setQuotaError(errorMessage(err));
    }
  }

  const left = quota === null ? null : Math.max(0, quota - u.requestsToday);
  const pct = quota ? Math.min(100, Math.round((u.requestsToday / quota) * 100)) : 0;

  const requestsLine = (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-subtle">Requests today</span>
        {quota !== null && <span className="text-[12.5px] tabular-nums text-muted">{pct}% used</span>}
      </div>
      {quota === null ? (
        // No quota yet: an empty track, so the card shows where the bar will appear.
        <div className="h-3 w-full rounded-full border border-dashed border-border-strong" aria-hidden />
      ) : (
        <ProgressBar value={u.requestsToday} max={quota} label={`${report.name} requests today`} className="h-3" />
      )}
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="text-muted">
          <span className="font-semibold tabular-nums text-fg">{formatNumber(u.requestsToday)}</span> used
        </span>
        {left === null ? (
          <span className="text-right text-subtle">Set a daily quota to see what's left</span>
        ) : (
          <span className="text-muted">
            <span className={cn('font-semibold tabular-nums', left === 0 ? 'text-danger' : 'text-fg')}>
              {formatNumber(left)}
            </span>{' '}
            left of {formatNumber(quota!)}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader
        title={report.name}
        description={<span className="block truncate font-mono text-[12.5px]" title={report.model ?? undefined}>{report.model ?? 'No model set'}</span>}
        actions={
          report.ready ? (
            <Badge tone="success" dot>
              Ready
            </Badge>
          ) : (
            <Badge tone="warning" dot>
              Not ready
            </Badge>
          )
        }
      />

      <div className="flex flex-1 flex-col gap-5 p-5">
        <section aria-label={`${report.name} daily quota`} className="space-y-3">
          {requestsLine}
          {editingQuota ? (
            <form className="flex flex-col gap-3 rounded-xl border border-border bg-surface-2/50 p-3.5 sm:flex-row sm:items-end" noValidate onSubmit={saveQuota}>
              <LimitInput
                label="Daily request quota"
                value={quotaDraft}
                onChange={setQuotaDraft}
                error={quotaError}
                hint="Your provider's free-tier limit. Only used for this bar."
                placeholder="No quota"
                className="w-full sm:max-w-xs"
              />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" size="sm" loading={saving} disabled={!config.data}>
                  Save quota
                </Button>
                <Button variant="ghost" size="sm" disabled={saving} onClick={() => setEditingQuota(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <Button variant="ghost" size="sm" icon={Pencil} disabled={!config.data} onClick={startEditing} className="-ml-3">
              {quota === null ? 'Set quota' : 'Edit quota'}
            </Button>
          )}
        </section>

        <section aria-label={`${report.name} totals`} className="grid grid-cols-2 gap-2">
          <StatTile label="Tokens today" value={reportsTokens ? formatCompact(u.tokensToday) : 'Not reported'} />
          <StatTile label="Tokens this month" value={reportsTokens ? formatCompact(u.tokensThisMonth) : 'Not reported'} />
          <StatTile label="Requests this month" value={formatNumber(u.requestsThisMonth)} />
          <StatTile
            label="Errors this month"
            value={formatNumber(u.errorsThisMonth)}
          />
          <StatTile
            label="Avg latency"
            value={u.avgLatencyMs === null ? '—' : `${formatNumber(Math.round(u.avgLatencyMs))} ms`}
          />
        </section>

        <section aria-label={`${report.name} last 14 days`} className="mt-auto space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-[12px] font-semibold uppercase tracking-wider text-subtle">Last 14 days</h4>
            {reportsTokens && (
              <SegmentedControl
                size="sm"
                ariaLabel={`${report.name} chart metric`}
                options={METRIC_OPTIONS}
                value={metric}
                onChange={setMetric}
              />
            )}
          </div>
          {metric === 'requests' || !reportsTokens ? (
            <BarChart data={report.dailyRequests} label={`${report.name} requests per day`} />
          ) : (
            <BarChart data={report.dailyTokens} label={`${report.name} tokens per day`} formatValue={formatCompact} />
          )}
        </section>
      </div>
    </Card>
  );
}
