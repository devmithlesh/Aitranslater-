import { Skeleton } from '@/components/ui';
import { formatNumber } from '@/utils/format';
import { useMe } from './useMe';
import { formatResetTime } from './format';

/** Header line: "18 of 30 translations left today · resets at 12:00 AM", or "Unlimited". */
export function CreditsBadge() {
  const { me, isLoading } = useMe();

  if (!me) {
    return isLoading ? <Skeleton className="h-4 w-56" /> : null;
  }

  const { credits } = me;
  if (credits.limit === null || me.plan === 'unlimited') {
    return <p className="text-[13px] text-muted">Unlimited</p>;
  }

  const remaining = credits.remaining ?? 0;
  const noun = remaining === 1 ? 'translation' : 'translations';
  return (
    <p className="text-[13px] text-muted">
      <span className="font-medium tabular-nums text-fg">
        {formatNumber(remaining)} of {formatNumber(credits.limit)}
      </span>{' '}
      {noun} left today · resets at {formatResetTime(credits.resetsAt)}
    </p>
  );
}
