import type { CreditStatus } from '@verba/shared';
import { Clock, LogIn } from 'lucide-react';
import { useGuest } from '../shared/guest';

/** "18 of 30 left today", "Unlimited", or null when there is nothing to show. */
function creditsText(credits: CreditStatus | null): string | null {
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
  const guest = useGuest();
  if (guest.isGuest) {
    // Free prompts are used up: the next step is an account, not waiting.
    return (
      <div role="alert" className="space-y-2.5 rounded-xl border border-brand/30 bg-brand-soft p-3 text-fg animate-fade-in">
        <p className="text-[12.5px] font-medium">
          {limit === null ? 'You have used your free prompts for today.' : `You have used your ${limit} free prompts for today.`} Sign in
          (it is free) to keep going.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => guest.openAuth('signin')}
            className="inline-flex h-7 items-center gap-1 rounded-lg bg-brand-gradient px-3 text-[12px] font-semibold text-brand-fg hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <LogIn size={13} aria-hidden /> Sign in
          </button>
          <button
            type="button"
            onClick={() => guest.openAuth('signup')}
            className="inline-flex h-7 items-center rounded-lg border border-border bg-surface px-3 text-[12px] font-medium hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            Create account
          </button>
        </div>
      </div>
    );
  }
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
