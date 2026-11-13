import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { ErrorState, Spinner } from '@/components/ui';
import { useMe } from '@/features/credits/useMe';

/** Admin-only route guard: non-admins are sent back to the translator. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { me, isAdmin, isLoading, isError, error, refetch } = useMe();

  if (isLoading) {
    return (
      <div className="flex justify-center py-24 text-brand">
        <Spinner size={22} />
      </div>
    );
  }
  if (!me && isError) {
    return <ErrorState error={error} onRetry={() => void refetch()} />;
  }
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
