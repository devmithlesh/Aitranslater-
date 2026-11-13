import { Clock } from 'lucide-react';
import { Card, EmptyState } from '@/components/ui';
import { formatResetTime, nextLocalMidnightIso } from './format';

/** Shown instead of a generic error when the caller's daily translation credits are used up. */
export function LimitReachedCard({ resetsAt }: { resetsAt?: string | null }) {
  const time = formatResetTime(resetsAt ?? nextLocalMidnightIso());
  return (
    <Card>
      <EmptyState
        icon={Clock}
        title={`Daily limit reached — resets at ${time}`}
        description="You have used today's translations. Come back after the reset, or ask the admin for a higher limit."
      />
    </Card>
  );
}
