import { decodeConnectionCode, normalizeApiUrl } from '@verba/shared';
import { AlertCircle, ArrowRight, Eye, EyeOff, TriangleAlert } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Field, IconButton, Input, SegmentedControl, Textarea } from '@/components/ui';
import { useAppDispatch } from '@/store';
import { connected } from '@/store/connectionSlice';
import { checkServer, ConnectCheckError } from './checkServer';
import { ConnectHelp } from './ConnectHelp';

type Mode = 'code' | 'manual';

interface Target {
  apiUrl: string;
  token: string;
}

interface FieldErrors {
  code?: string;
  url?: string;
  token?: string;
}

export interface ConnectFormProps {
  /** Connection code from the `?code=` query parameter. */
  initialCode: string | null;
  initialUrl: string;
  redirectTo: string;
  unauthorized: boolean;
}

const MODES = [
  { value: 'code', label: 'Connection code' },
  { value: 'manual', label: 'URL + token' },
] as const;

/** Parses the form into a server target, or sets inline errors and returns null. */
function resolveTarget(mode: Mode, code: string, url: string, token: string, setErrors: (e: FieldErrors) => void): Target | null {
  if (mode === 'code') {
    const decoded = decodeConnectionCode(code);
    if (!decoded) {
      setErrors({ code: 'That does not look like a Verba connection code. It starts with verba_.' });
      return null;
    }
    return { apiUrl: decoded.apiUrl, token: decoded.token };
  }

  const apiUrl = normalizeApiUrl(url);
  let protocol = '';
  try {
    protocol = new URL(apiUrl).protocol;
  } catch {
    protocol = '';
  }
  if (protocol !== 'http:' && protocol !== 'https:') {
    setErrors({ url: 'Enter a full URL starting with http:// or https://.' });
    return null;
  }
  const trimmedToken = token.trim();
  if (!trimmedToken) {
    setErrors({ token: 'Paste the access token from your backend console.' });
    return null;
  }
  return { apiUrl, token: trimmedToken };
}

export function ConnectForm({ initialCode, initialUrl, redirectTo, unauthorized }: ConnectFormProps) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(initialCode ? 'code' : 'manual');
  const [code, setCode] = useState(initialCode ?? '');
  const [url, setUrl] = useState(initialUrl);
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const codeServer = mode === 'code' ? (decodeConnectionCode(code)?.apiUrl ?? null) : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (checking) return;
    setErrors({});
    setServerError(null);
    const target = resolveTarget(mode, code, url, token, setErrors);
    if (!target) return;

    setChecking(true);
    try {
      await checkServer(target.apiUrl, target.token);
      dispatch(connected(target));
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setServerError(err instanceof ConnectCheckError ? err.message : 'Something unexpected went wrong. Try again.');
      setChecking(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-pop animate-scale-in">
      <div className="space-y-1 px-6 pb-5 pt-6 sm:px-8">
        <h1 className="text-xl font-semibold tracking-tight text-fg">Connect to your Verba server</h1>
        <p className="text-[13.5px] text-muted">Your settings, history and API keys live on your server. This browser only keeps the link.</p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-5 px-6 pb-6 sm:px-8">
        {unauthorized && (
          <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-warning/20 bg-warning-soft p-3 text-[13px] text-fg">
            <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden />
            Your saved token is no longer valid. Enter a fresh one to continue.
          </div>
        )}

        <SegmentedControl
          ariaLabel="How do you want to connect?"
          options={MODES}
          value={mode}
          onChange={(m) => {
            setMode(m);
            setErrors({});
            setServerError(null);
          }}
          className="w-full [&>button]:flex-1 [&>button]:justify-center"
        />

        {mode === 'code' ? (
          <Field
            label="Connection code"
            hint="Print it with npm run token -w @verba/backend."
            error={errors.code}
          >
            {(id) => (
              <>
                <Textarea
                  id={id}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  rows={3}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="verba_eyJ2IjoxLCJhcGlVcmwi…"
                  aria-invalid={!!errors.code || undefined}
                  className="break-all font-mono text-[12.5px]"
                />
                {codeServer && (
                  // The code is opaque; show which server it points at so a crafted link can't hide it.
                  <p className="mt-2 break-all text-[12.5px] text-muted">
                    Connects to <span className="font-mono font-medium text-fg">{codeServer}</span>. Only continue if this is your server.
                  </p>
                )}
              </>
            )}
          </Field>
        ) : (
          <>
            <Field label="Server URL" hint="Where your Verba backend is running." error={errors.url}>
              {(id) => (
                <Input
                  id={id}
                  type="url"
                  inputMode="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="http://localhost:8787"
                  invalid={!!errors.url}
                />
              )}
            </Field>
            <Field label="Access token" hint="Printed in the backend console on first start." error={errors.token}>
              {(id) => (
                <div className="relative">
                  <Input
                    id={id}
                    type={showToken ? 'text' : 'password'}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Paste your token"
                    invalid={!!errors.token}
                    className="pr-11 font-mono text-[13px]"
                  />
                  <IconButton
                    icon={showToken ? EyeOff : Eye}
                    label={showToken ? 'Hide token' : 'Show token'}
                    size="sm"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2"
                    onClick={() => setShowToken((s) => !s)}
                  />
                </div>
              )}
            </Field>
          </>
        )}

        {serverError && (
          <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-danger/20 bg-danger-soft p-3 text-[13px] text-fg animate-fade-in">
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden />
            <span>{serverError}</span>
          </div>
        )}

        <Button type="submit" size="lg" fullWidth loading={checking} iconRight={checking ? undefined : ArrowRight}>
          {checking ? 'Checking server…' : 'Connect'}
        </Button>
      </form>

      <ConnectHelp />
    </div>
  );
}
