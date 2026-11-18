import { Link, useLocation } from 'react-router-dom';
import { AuthCard, AuthLayout } from '@/features/auth/AuthLayout';
import { LoginForm } from '@/features/auth/LoginForm';
import { readFromState, readUnauthorized } from '@/features/auth/redirect';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuthConfigQuery } from '@/store/api';

/** First page for signed-out visitors: email + password, or Google. */
export default function LoginPage() {
  const location = useLocation();
  const config = useAuthConfigQuery();
  const redirectTo = readFromState(location.state);
  const unauthorized = readUnauthorized(location.state);
  usePageTitle('Sign in', 'Sign in to Verba, the AI writing and translation assistant. Type in any language and get natural English in any tone.');

  return (
    <AuthLayout>
      <AuthCard title="Sign in to Verba" description="Translate and rewrite with your daily free limit.">
        <LoginForm
          googleClientId={config.data?.googleClientId ?? null}
          redirectTo={redirectTo}
          notice={unauthorized ? 'Your session has ended. Sign in again to continue.' : null}
        />
      </AuthCard>

      <div className="mt-6 space-y-3 text-center text-[13.5px] text-muted">
        <p>
          New to Verba?{' '}
          <Link to="/signup" state={location.state} className="font-medium text-brand underline-offset-2 hover:underline">
            Create account
          </Link>
        </p>
        <p className="text-[12.5px]">
          <Link to="/connect" className="text-subtle underline-offset-2 hover:text-muted hover:underline">
            Advanced: self-hosted server (URL + token)
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
