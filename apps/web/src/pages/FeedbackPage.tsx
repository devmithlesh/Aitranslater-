import type { FeedbackCategory } from '@verba/shared';
import { MessageSquareText } from 'lucide-react';
import { Badge, Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui';
import { useAdminFeedbackQuery } from '@/store/api';
import { formatNumber, formatRelative } from '@/utils/format';

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  idea: 'Idea',
  bug: 'Something broke',
  other: 'Other',
};

const CATEGORY_TONES: Record<FeedbackCategory, 'brand' | 'danger' | 'neutral'> = {
  idea: 'brand',
  bug: 'danger',
  other: 'neutral',
};

/** Admin only: what people wrote in the extension's feedback form, newest first. */
export default function FeedbackPage() {
  const feedback = useAdminFeedbackQuery();
  const items = feedback.data?.items;

  let body;
  if (!items) {
    body = feedback.isError ? (
      <div className="p-5">
        <ErrorState error={feedback.error} onRetry={() => void feedback.refetch()} />
      </div>
    ) : (
      <div className="space-y-4 p-5" aria-busy aria-label="Loading feedback">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    );
  } else if (items.length === 0) {
    body = <EmptyState icon={MessageSquareText} title="No feedback yet" description="Messages sent from the extension appear here." />;
  } else {
    body = (
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.id} className="space-y-2 px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={CATEGORY_TONES[item.category]}>{CATEGORY_LABELS[item.category]}</Badge>
              <span className="min-w-0 break-words text-[13px] font-medium text-fg">{item.userName ?? 'Deleted account'}</span>
              {item.userEmail && <span className="min-w-0 break-all text-[12px] text-muted">{item.userEmail}</span>}
              <span className="ml-auto text-[12px] text-subtle" title={new Date(item.createdAt).toLocaleString()}>
                {formatRelative(item.createdAt)}
              </span>
            </div>
            {/* Plain text only: a message is never rendered as HTML. */}
            <p className="whitespace-pre-wrap break-words text-[14px] leading-6 text-fg">{item.message}</p>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="animate-slide-up space-y-6">
      <PageHeader
        title="Feedback"
        description="What people wrote in the extension's feedback form."
        icon={<MessageSquareText size={20} aria-hidden />}
      />
      <Card>
        <CardHeader
          title="Latest messages"
          description={items ? `${formatNumber(items.length)} shown, newest first.` : 'Newest first.'}
        />
        {body}
      </Card>
    </div>
  );
}
