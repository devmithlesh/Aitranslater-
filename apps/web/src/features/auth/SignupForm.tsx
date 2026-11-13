import { AlertCircle, ArrowRight } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button, Field, Input } from '@/components/ui';
import {
  errorMessage,
  useGoogleLoginMutation,
  useSignupMutation,
  type AppError,
} from '@/store/api';
import { GoogleButton } from './GoogleButton';
import { PasswordField } from './PasswordField';
import { useFinishSignIn } from './session';
import { checkConfirmation, checkEmail, checkName, checkPassword } from './validation';

export interface SignupFormProps {
  googleClientId: string | null;
  redirectTo: string;
}

interface FieldErrors {
  name?: string | null;
  email?: string | null;
  password?: string | null;
  confirm?: string | null;
}

export function SignupForm({ googleClientId, redirectTo }: SignupFormProps) {
  const finishSignIn = useFinishSignIn();
  const [signup, { isLoading: emailBusy }] = useSignupMutation();
  const [googleLogin, { isLoading: googleBusy }] = useGoogleLoginMutation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const busy = emailBusy || googleBusy;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const next: FieldErrors = {
      name: checkName(name),
      email: checkEmail(email),
      password: checkPassword(password),
      confirm: checkConfirmation(password, confirm),
    };
    setErrors(next);
    setServerError(null);
    if (Object.values(next).some(Boolean)) return;

    try {
      const session = await signup({ name: name.trim(), email: email.trim(), password }).unwrap();
      finishSignIn(session, redirectTo);
    } catch (err) {
      const status = (err as Partial<AppError>).status;
      setServerError(
        status === 409
          ? 'An account with this email already exists — sign in instead.'
          : errorMessage(err),
      );
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
      {googleClientId && <GoogleButton clientId={googleClientId} mode="signup" onCredential={onGoogleCredential} />}

      <form onSubmit={submit} noValidate className="space-y-5">
        <Field label="Name" error={errors.name}>
          {(id) => (
            <Input
              id={id}
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              invalid={!!errors.name}
            />
          )}
        </Field>

        <Field label="Email" error={errors.email}>
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
              invalid={!!errors.email}
            />
          )}
        </Field>

        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          error={errors.password}
          hint="At least 8 characters."
        />

        <PasswordField
          label="Confirm password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          error={errors.confirm}
        />

        {serverError && (
          <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-danger/20 bg-danger-soft p-3 text-[13px] text-fg animate-fade-in">
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden />
            <span>{serverError}</span>
          </div>
        )}

        <Button type="submit" size="lg" fullWidth loading={emailBusy} iconRight={emailBusy ? undefined : ArrowRight}>
          {emailBusy ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </div>
  );
}
