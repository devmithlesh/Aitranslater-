import { Link, useLocation } from 'react-router-dom';
import { ErrorState, Skeleton } from '@/components/ui';
import { AuthCard, AuthLayout } from '@/features/auth/AuthLayout';
import { readFromState } from '@/features/auth/redirect';
import { SignupForm } from '@/features/auth/SignupForm';
import { useAuthConfigQuery } from '@/store/api';

/** Account creation. Hidden when the admin has closed signups. */
export default function SignupPage() {
  const location = useLocation();
  const config = useAuthConfigQuery();
  const redirectTo = readFromState(location.state);

  let body;
  if (config.isError && !config.data) {
    body = <ErrorState error={config.error} onRetry={() => void config.refetch()} />;
  } else if (!config.data) {
    body = (
      <div className="space-y-4" aria-busy aria-label="Loading sign-up">
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>
    );
  } else if (!config.data.signupsEnabled) {
    body = <p className="text-[14px] text-fg">New signups are closed right now.</p>;
  } else {
    body = <SignupForm googleClientId={config.data.googleClientId} redirectTo={redirectTo} />;
  }

  return (
    <AuthLayout>
      <AuthCard title="Create your account" description="Free daily translations. Unlimited plan coming soon.">
        {body}
      </AuthCard>

      <p className="mt-6 text-center text-[13.5px] text-muted">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-brand underline-offset-2 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
