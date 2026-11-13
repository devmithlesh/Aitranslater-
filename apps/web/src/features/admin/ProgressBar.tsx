import { cn } from '@/utils/cn';
import { formatNumber } from '@/utils/format';

/** Usage against a quota. Turns amber at 80% and red once the quota is reached. */
export function ProgressBar({
  value,
  max,
  label,
  className,
}: {
  value: number;
  max: number;
  label: string;
  /** Overrides the track height, e.g. "h-3". */
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const reached = value >= max;
  const near = !reached && pct >= 80;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      aria-valuetext={`${formatNumber(value)} of ${formatNumber(max)}`}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-2', className)}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500',
          reached ? 'bg-danger' : near ? 'bg-warning' : 'bg-brand',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
