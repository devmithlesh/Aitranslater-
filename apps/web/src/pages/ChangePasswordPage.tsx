import { KeyRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, CardHeader, ErrorState, Skeleton, useToast } from '@/components/ui';
import { PasswordField } from '@/features/auth/PasswordField';
import { checkConfirmation, checkPassword } from '@/features/auth/validation';
import { useAppDispatch } from '@/store';
import { api, errorMessage, useChangePasswordMutation, useMeQuery } from '@/store/api';

/** Choose a new password, or add one to a Google-only account. Required before the app opens after an admin reset. */
export default function ChangePasswordPage() {
  const me = useMeQuery();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const toast = useToast();
  const [changePassword, { isLoading }] = useChangePasswordMutation();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ current?: string | null; next?: string | null; confirm?: string | null }>({});
  const [serverError, setServerError] = useState<string | null>(null);

  if (!me.data) {
    if (me.isError) return <ErrorState error={me.error} onRetry={() => void me.refetch()} />;
    return (
      <Card className="mx-auto max-w-md space-y-3 p-6" aria-busy aria-label="Loading account">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-10 w-full rounded-xl" />
      </Card>
    );
  }

  const hasPassword = me.data.hasPassword;
  const mustChange = me.data.mustChangePassword;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading) return;
    const problems: typeof errors = {
      current: hasPassword && !current ? 'Enter your current password.' : null,
      next: checkPassword(next),
      confirm: checkConfirmation(next, confirm),
    };
    setErrors(problems);
    setServerError(null);
    if (Object.values(problems).some(Boolean)) return;

    try {
      await changePassword(hasPassword ? { currentPassword: current, newPassword: next } : { newPassword: next }).unwrap();
      // Clear the flag locally first so the route guard does not bounce the user back here while `me` refetches.
      dispatch(
        api.util.updateQueryData('me', undefined, (draft) => {
          draft.mustChangePassword = false;
          draft.hasPassword = true;
        }),
      );
      toast.success(hasPassword ? 'Password changed' : 'Password added');
      navigate('/', { replace: true });
    } catch (err) {
      setServerError(errorMessage(err));
    }
  }

  const title = hasPassword ? 'Change password' : 'Add a password';
  const description = mustChange
    ? 'An administrator reset your password. Choose a new one to continue.'
    : hasPassword
      ? 'Use at least 8 characters. Other devices stay signed in until you sign out.'
      : 'Your account signs in with Google. Add a password to also sign in with your email.';

  return (
    <div className="mx-auto w-full max-w-md animate-slide-up">
      <Card>
        <CardHeader icon={<KeyRound size={17} aria-hidden />} title={title} description={description} />
        <form onSubmit={submit} noValidate className="space-y-5 p-5">
          {hasPassword && (
            <PasswordField
              label="Current password"
              value={current}
              onChange={setCurrent}
              autoComplete="current-password"
              error={errors.current}
            />
          )}
          <PasswordField
            label={hasPassword ? 'New password' : 'Password'}
            value={next}
            onChange={setNext}
            autoComplete="new-password"
            error={errors.next}
            hint="At least 8 characters."
          />
          <PasswordField
            label="Confirm password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            error={errors.confirm}
          />

          {serverError && <ErrorState compact error={{ message: serverError }} />}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" loading={isLoading}>
              {hasPassword ? 'Save new password' : 'Add password'}
            </Button>
            {!mustChange && (
              <Link to="/" className="text-[13px] font-medium text-muted underline-offset-2 hover:text-fg hover:underline">
                Cancel
              </Link>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}
