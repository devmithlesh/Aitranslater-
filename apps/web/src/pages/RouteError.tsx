import { AlertOctagon } from 'lucide-react';
import { useRouteError } from 'react-router-dom';
import { Button, EmptyState } from '@/components/ui';

/** Last-resort boundary for render errors and failed lazy chunks (e.g. after a deploy). */
export function RouteError() {
  const error = useRouteError() as Error | undefined;
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <EmptyState
        icon={AlertOctagon}
        title="Something broke on this page"
        description={error?.message ?? 'An unexpected error occurred.'}
        action={<Button onClick={() => window.location.reload()}>Reload</Button>}
      />
    </div>
  );
}
