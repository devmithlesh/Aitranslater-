const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const nf = new Intl.NumberFormat();
const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

export function formatNumber(n: number): string {
  return nf.format(n);
}

export function formatCompact(n: number): string {
  return compact.format(n);
}

/** "3 minutes ago", "yesterday", or a short date beyond a week. */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const date = new Date(iso);
  const diffSec = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 45) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 604_800) return rtf.format(Math.round(diffSec / 86_400), 'day');
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
