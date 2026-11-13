import type { DailyPoint } from '@verba/shared';
import { cn } from '@/utils/cn';
import { formatNumber } from '@/utils/format';
import { formatDayLong, formatDayShort } from './chartFormat';

export interface BarChartProps {
  data: DailyPoint[];
  /** Describes the series for screen readers, e.g. "Requests per day". */
  label: string;
  formatValue?: (n: number) => string;
  className?: string;
}

/**
 * Plain-div bar chart: responsive, zero-filled data drawn as-is, a title per bar for hover,
 * and an aria-label summary for assistive tech.
 */
export function BarChart({ data, label, formatValue = formatNumber, className }: BarChartProps) {
  const first = data[0];
  const last = data[data.length - 1];
  if (!first || !last) {
    return <p className="py-10 text-center text-[13px] text-muted">No data yet.</p>;
  }

  const total = data.reduce((sum, p) => sum + p.value, 0);
  const peak = data.reduce<DailyPoint>((best, p) => (p.value > best.value ? p : best), first);
  const max = Math.max(1, peak.value);
  const summary =
    peak.value > 0
      ? `${label}: ${formatValue(total)} in total over ${data.length} days. Peak ${formatValue(peak.value)} on ${formatDayLong(peak.day)}.`
      : `${label}: no activity in the last ${data.length} days.`;

  return (
    <div className={cn('min-w-0', className)}>
      <div role="img" aria-label={summary} className="flex h-36 items-end gap-1 border-b border-border sm:gap-1.5">
        {data.map((p) => (
          <div key={p.day} title={`${formatDayLong(p.day)}: ${formatValue(p.value)}`} className="flex h-full min-w-0 flex-1 items-end">
            <div
              className="w-full rounded-t-[5px] bg-brand transition-[height] duration-300"
              style={{ height: `${(p.value / max) * 100}%`, minHeight: p.value > 0 ? 3 : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-subtle">
        <span>{formatDayShort(first.day)}</span>
        <span>{formatDayShort(last.day)}</span>
      </div>
    </div>
  );
}
