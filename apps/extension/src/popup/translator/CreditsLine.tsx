import type { CreditStatus } from '@verba/shared';
import { Clock } from 'lucide-react';

/** "18 of 30 left today", "Unlimited", or null when there is nothing to show. */
export function creditsText(credits: CreditStatus | null): string | null {
  if (!credits) return null;
  if (credits.limit === null) return 'Unlimited';
  if (credits.remaining === null) return null;
  return `${credits.remaining} of ${credits.limit} left today`;
}

/** Muted one-line credit counter. The text is empty (but the live region stays mounted) until /me answers. */
export function CreditsLine({ credits }: { credits: CreditStatus | null }) {
  return (
    <p aria-live="polite" className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-subtle">
      {creditsText(credits)}
    </p>
  );
}

/** Local time of a reset timestamp, or null when it is missing or not a valid date. */
export function formatResetTime(resetsAt: string | null | undefined): string | null {
  if (!resetsAt) return null;
  const date = new Date(resetsAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Reads an optional `resetsAt` the server may attach to a CREDIT_LIMIT_REACHED error. */
export function readResetsAt(details: unknown): string | null {
  if (typeof details !== 'object' || details === null || !('resetsAt' in details)) return null;
  const value = (details as { resetsAt: unknown }).resetsAt;
  return typeof value === 'string' ? value : null;
}

/** Shown instead of the generic error when the daily credits are used up. The Translate button stays usable. */
export function CreditLimitNotice({ limit, resetsAt }: { limit: number | null; resetsAt: string | null }) {
  const time = formatResetTime(resetsAt);
  const used = limit === null ? 'all your translations' : `all ${limit} translations`;
  const reset = time ? `They reset at ${time}.` : 'They reset daily.';
  return (
    <div role="alert" className="flex gap-2.5 rounded-xl border border-danger/20 bg-danger-soft p-3 text-fg animate-fade-in">
      <Clock size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden />
      <p className="min-w-0 flex-1 text-[12.5px] font-medium">{`You've used ${used} for today. ${reset}`}</p>
    </div>
  );
}
