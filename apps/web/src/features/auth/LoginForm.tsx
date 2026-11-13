import { AlertCircle, ArrowRight } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button, Field, Input } from '@/components/ui';
import { errorMessage, useGoogleLoginMutation, useLoginMutation, type AppError } from '@/store/api';
import { GoogleButton } from './GoogleButton';
import { PasswordField } from './PasswordField';
import { useFinishSignIn } from './session';
import { checkEmail, checkPassword } from './validation';

export interface LoginFormProps {
  googleClientId: string | null;
  redirectTo: string;
  /** Shown above the form, e.g. when the session ended. */
  notice?: string | null;
}

export function LoginForm({ googleClientId, redirectTo, notice }: LoginFormProps) {
  const finishSignIn = useFinishSignIn();
  const [login, { isLoading: emailBusy }] = useLoginMutation();
  const [googleLogin, { isLoading: googleBusy }] = useGoogleLoginMutation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const busy = emailBusy || googleBusy;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const emailProblem = checkEmail(email);
    const passwordProblem = checkPassword(password);
    setEmailError(emailProblem);
    setPasswordError(passwordProblem);
    setServerError(null);
    if (emailProblem || passwordProblem) return;

    try {
      const session = await login({ email: email.trim(), password }).unwrap();
      finishSignIn(session, redirectTo);
    } catch (err) {
      const status = (err as Partial<AppError>).status;
      setServerError(status === 401 ? 'Wrong email or password.' : errorMessage(err));
    }
  }

  async function onGoogleCredential(idToken: string) {
    if (busy) return;
    setServerError(null);
    try {
      const session = await googleLogin({ idToken }).unwrap();
      finishSignIn(session, redirectTo);
    } catch (err) {
      setServerError(errorMessage(err));
    }
  }

  return (
    <div className="space-y-5">
      {notice && (
        <p role="status" aria-live="polite" className="rounded-xl border border-warning/20 bg-warning-soft p-3 text-[13px] text-fg">
          {notice}
        </p>
      )}

      {googleClientId && <GoogleButton clientId={googleClientId} mode="signin" onCredential={onGoogleCredential} />}

      <form onSubmit={submit} noValidate className="space-y-5">
        <Field label="Email" error={emailError}>
          {(id) => (
            <Input
              id={id}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              invalid={!!emailError}
            />
          )}
        </Field>

        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          error={passwordError}
        />

        {serverError && (
          <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-danger/20 bg-danger-soft p-3 text-[13px] text-fg animate-fade-in">
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden />
            <span>{serverError}</span>
          </div>
        )}

        <Button type="submit" size="lg" fullWidth loading={emailBusy} iconRight={emailBusy ? undefined : ArrowRight}>
          {emailBusy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p className="text-center text-[12.5px] text-muted">Forgot password? Ask the admin to reset it.</p>
    </div>
  );
}
