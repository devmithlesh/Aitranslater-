import { EMAIL_MAX_LENGTH, NAME_MAX_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@verba/shared';
import { ExternalLink, Eye, EyeOff, LogIn, UserPlus, type LucideIcon } from 'lucide-react';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { openDashboard } from '../components/navigation';
import { Button, IconButton } from '../components/ui/Button';
import { fieldClass } from '../components/ui/fieldClass';
import { sendToBackground, type ExtensionError } from '../shared/messages';

export type AuthMode = 'signin' | 'signup';

const COPY: Record<AuthMode, { heading: string; subheading: string; submit: string; icon: LucideIcon }> = {
  signin: {
    heading: 'Sign in to Verba',
    subheading: 'Use your Verba account.',
    submit: 'Sign in',
    icon: LogIn,
  },
  signup: {
    heading: 'Create your free account',
    subheading: 'Free daily translations. No card needed.',
    submit: 'Create account',
    icon: UserPlus,
  },
};

interface AuthPanelProps {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  /** Called after a successful sign-in or sign-up; the popup re-reads state and shows the translator. */
  onSignedIn: () => void;
}

/** Signed-out body of the popup: sign in or create an account without leaving the popup. */
export function AuthPanel({ mode, onModeChange, onSignedIn }: AuthPanelProps) {
  const id = useId();
  const nameId = `${id}-name`;
  const emailId = `${id}-email`;
  const passwordId = `${id}-password`;
  const hintId = `${id}-hint`;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ExtensionError | null>(null);
  const [webError, setWebError] = useState<string | null>(null);
  const [seenMode, setSeenMode] = useState(mode);

  // Switching modes (from the header or the switch line) clears the password and any error.
  if (seenMode !== mode) {
    setSeenMode(mode);
    setPassword('');
    setError(null);
  }

  const isSignup = mode === 'signup';
  const copy = COPY[mode];
  const trimmedName = name.trim();
  const trimmedEmail = email.trim();

  const nameOk = !isSignup || (trimmedName.length > 0 && trimmedName.length <= NAME_MAX_LENGTH);
  const emailOk = trimmedEmail.length > 0 && trimmedEmail.length <= EMAIL_MAX_LENGTH;
  const passwordOk = isSignup
    ? password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH
    : password.length > 0 && password.length <= PASSWORD_MAX_LENGTH;
  const canSubmit = nameOk && emailOk && passwordOk && !busy;

  /** The password is always cleared after an attempt and is never logged or kept in state. */
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);

    const res = isSignup
      ? await sendToBackground({ type: 'verba:signup', name: trimmedName, email: trimmedEmail, password })
      : await sendToBackground({ type: 'verba:login', email: trimmedEmail, password });

    setPassword('');
    setBusy(false);
    if (res.ok) {
      onSignedIn();
    } else {
      setError(res.error);
    }
  }

  /** Password reset must be finished on the website. */
  async function openLoginPage() {
    const res = await openDashboard('/login');
    if (!res.ok) setError(res.error);
  }

  /** Opens the website sign-in flow; it links this extension back automatically. */
  async function continueOnWebsite() {
    setWebError(null);
    const res = await openDashboard(`/extension/connect?ext=${chrome.runtime.id}`);
    if (res.ok) {
      window.close();
    } else {
      setWebError(res.error.message);
    }
  }

  return (
    <div className="space-y-3 p-3">
      <div>
        <h2 className="text-[15px] font-semibold">{copy.heading}</h2>
        <p className="text-[12.5px] leading-5 text-muted">{copy.subheading}</p>
      </div>

      <form className="space-y-3" noValidate onSubmit={(e) => void submit(e)}>
        {isSignup && (
          <FormField htmlFor={nameId} label="Name">
            <input
              id={nameId}
              type="text"
              name="name"
              autoComplete="name"
              autoFocus
              maxLength={NAME_MAX_LENGTH}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={fieldClass}
            />
          </FormField>
        )}

        <FormField htmlFor={emailId} label="Email">
          <input
            id={emailId}
            type="email"
            name="email"
            autoComplete={isSignup ? 'email' : 'username'}
            inputMode="email"
            spellCheck={false}
            autoFocus={!isSignup}
            maxLength={EMAIL_MAX_LENGTH}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldClass}
          />
        </FormField>

        <FormField
          htmlFor={passwordId}
          label="Password"
          hint={isSignup ? <span id={hintId}>At least {PASSWORD_MIN_LENGTH} characters</span> : undefined}
        >
          <div className="relative">
            <input
              id={passwordId}
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              maxLength={PASSWORD_MAX_LENGTH}
              value={password}
              aria-describedby={isSignup ? hintId : undefined}
              onChange={(e) => setPassword(e.target.value)}
              className={`${fieldClass} pr-10`}
            />
            <IconButton
              icon={showPassword ? EyeOff : Eye}
              label={showPassword ? 'Hide password' : 'Show password'}
              size="sm"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-1.5 top-1.5"
            />
          </div>
        </FormField>

        {error && (
          <div className="space-y-2">
            <p role="alert" className="text-[12px] leading-5 text-danger">
              {error.message}
            </p>
            {error.code === 'PASSWORD_RESET_REQUIRED' && (
              <Button size="sm" variant="outline" icon={ExternalLink} onClick={() => void openLoginPage()}>
                Open website
              </Button>
            )}
          </div>
        )}

        <Button type="submit" fullWidth icon={copy.icon} loading={busy} disabled={!canSubmit}>
          {copy.submit}
        </Button>
      </form>

      <p className="text-center text-[12.5px] text-muted">
        {isSignup ? 'Already have an account? ' : 'New to Verba? '}
        <button
          type="button"
          onClick={() => onModeChange(isSignup ? 'signin' : 'signup')}
          className="font-medium text-brand hover:underline"
        >
          {isSignup ? 'Sign in' : 'Create account'}
        </button>
      </p>

      <div className="flex items-center gap-3 text-[12px] text-subtle">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="space-y-1.5">
        <Button variant="outline" fullWidth onClick={() => void continueOnWebsite()}>
          Continue on the Verba website
        </Button>
        <p className="text-center text-[12px] leading-5 text-muted">
          Already signed in there? The extension connects automatically.
        </p>
        {webError && (
          <p role="alert" className="text-center text-[12px] text-danger">
            {webError}
          </p>
        )}
      </div>
    </div>
  );
}

function FormField({
  htmlFor,
  label,
  hint,
  children,
}: {
  htmlFor: string;
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[12.5px] font-medium text-fg">
        {label}
      </label>
      {children}
      {hint && <div className="text-[12px] leading-5 text-muted">{hint}</div>}
    </div>
  );
}
