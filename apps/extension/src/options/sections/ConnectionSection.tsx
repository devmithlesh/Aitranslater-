import { decodeConnectionCode, EMAIL_MAX_LENGTH, normalizeApiUrl, PASSWORD_MAX_LENGTH } from '@verba/shared';
import { ExternalLink, Eye, EyeOff, LogIn, Plug, RefreshCw, Unplug } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { connectionStatus, StatusDot } from '../../components/ConnectionStatus';
import { relativeTime } from '../../components/format';
import { Button, IconButton } from '../../components/ui/Button';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { fieldClass } from '../../components/ui/fieldClass';
import {
  DEFAULT_API_URL,
  DEFAULT_DASHBOARD_URL,
  sendToBackground,
  type ExtensionState,
} from '../../shared/messages';
import { isLocalUrl, isHttpUrl, parseHttpUrl } from '../validation';
import { Field, Notice, SectionCard } from './SectionCard';

type Tab = 'email' | 'code';
type Busy = 'login' | 'connect' | 'manual' | 'sync' | 'disconnect' | 'dashboard' | null;

const TAB_OPTIONS = [
  { value: 'email', label: 'Email' },
  { value: 'code', label: 'Code from website' },
] as const;

interface Feedback {
  tone: 'success' | 'error';
  text: string;
  /** Shows an "Open website" button (password reset must be finished on the website). */
  website?: boolean;
}

/**
 * Asks for host permission for a non-local server. Must be called synchronously from the
 * click handler (before any await) so the user gesture is still valid.
 */
function requestServerPermission(apiUrl: string): Promise<boolean> {
  const origin = new URL(apiUrl).origin;
  return chrome.permissions.request({ origins: [`${origin}/*`] }).catch(() => false);
}

/** Local servers need no extra permission; others are requested now, inside the click. */
function grantServerAccess(apiUrl: string): Promise<boolean> {
  return isLocalUrl(apiUrl) ? Promise.resolve(true) : requestServerPermission(apiUrl);
}

const PERMISSION_MESSAGE = 'Permission is required to reach your server.';

export function ConnectionSection({ state, refresh }: { state: ExtensionState | null; refresh: () => void }) {
  const connected = state?.connected === true;
  const status = connectionStatus(state);

  const [tab, setTab] = useState<Tab>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState('');
  const [serverUrl, setServerUrl] = useState(DEFAULT_API_URL);
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [dashboardDraft, setDashboardDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const savedDashboard = state?.dashboardUrl ?? DEFAULT_DASHBOARD_URL;
  const dashboardInput = dashboardDraft ?? savedDashboard;
  const dashboardUrl = parseHttpUrl(dashboardInput);
  const dashboardChanged = dashboardUrl !== null && dashboardUrl !== savedDashboard;
  const websiteUrl = dashboardUrl ?? DEFAULT_DASHBOARD_URL;

  const decoded = useMemo(() => (code.trim() ? decodeConnectionCode(code) : null), [code]);
  const codeInvalid = code.trim().length > 0 && decoded === null;

  const serverApiUrl = normalizeApiUrl(serverUrl);
  const serverValid = isHttpUrl(serverApiUrl);
  const customServer = serverValid && serverApiUrl !== DEFAULT_API_URL;
  const emailValid = email.trim().length > 0 && email.trim().length <= EMAIL_MAX_LENGTH;
  const passwordValid = password.length > 0 && password.length <= PASSWORD_MAX_LENGTH;
  const manualValid = serverValid && token.trim().length > 0;

  const canSignIn = serverValid && emailValid && passwordValid && dashboardUrl !== null && busy === null;
  const canConnectCode = decoded !== null && dashboardUrl !== null && busy === null;
  const canConnectManual = manualValid && dashboardUrl !== null && busy === null;

  /** Email + password sign-in. The password is cleared after the attempt and never kept. */
  async function signIn(event?: FormEvent) {
    event?.preventDefault();
    if (!canSignIn || !dashboardUrl) return;
    setBusy('login');
    setFeedback(null);

    if (!(await grantServerAccess(serverApiUrl))) {
      setBusy(null);
      setFeedback({ tone: 'error', text: PERMISSION_MESSAGE });
      return;
    }

    const res = await sendToBackground({
      type: 'verba:login',
      apiUrl: serverApiUrl,
      email: email.trim(),
      password,
      dashboardUrl,
    });
    setPassword('');
    setBusy(null);
    if (res.ok) {
      setEmail('');
      setDashboardDraft(null);
      setFeedback({ tone: 'success', text: 'Signed in. Settings are synced.' });
      refresh();
    } else {
      setFeedback({ tone: 'error', text: res.error.message, website: res.error.code === 'PASSWORD_RESET_REQUIRED' });
    }
  }

  /** Connection code from the website (also used by Google accounts). */
  async function connectWithCode() {
    if (!decoded || !dashboardUrl || busy !== null) return;
    setBusy('connect');
    setFeedback(null);

    if (!(await grantServerAccess(decoded.apiUrl))) {
      setBusy(null);
      setFeedback({ tone: 'error', text: PERMISSION_MESSAGE });
      return;
    }

    const res = await sendToBackground({ type: 'verba:connect', code: code.trim(), dashboardUrl });
    setBusy(null);
    if (res.ok) {
      setCode('');
      setDashboardDraft(null);
      setFeedback({ tone: 'success', text: 'Connected. Settings are synced.' });
      refresh();
    } else {
      setFeedback({ tone: 'error', text: res.error.message });
    }
  }

  /** Advanced: server URL + access token (self-hosted). */
  async function connectWithToken() {
    if (!canConnectManual || !dashboardUrl) return;
    setBusy('manual');
    setFeedback(null);

    if (!(await grantServerAccess(serverApiUrl))) {
      setBusy(null);
      setFeedback({ tone: 'error', text: PERMISSION_MESSAGE });
      return;
    }

    const res = await sendToBackground({
      type: 'verba:connect',
      apiUrl: serverApiUrl,
      token: token.trim(),
      dashboardUrl,
    });
    setBusy(null);
    if (res.ok) {
      setToken('');
      setDashboardDraft(null);
      setFeedback({ tone: 'success', text: 'Connected. Settings are synced.' });
      refresh();
    } else {
      setFeedback({ tone: 'error', text: res.error.message });
    }
  }

  async function syncNow() {
    setBusy('sync');
    setFeedback(null);
    const res = await sendToBackground({ type: 'verba:sync' });
    setBusy(null);
    if (res.ok) {
      setFeedback({ tone: 'success', text: 'Synced just now.' });
      refresh();
    } else {
      setFeedback({ tone: 'error', text: res.error.message });
    }
  }

  async function signOut() {
    if (!window.confirm('Sign out of Verba on this device? This also ends this extension’s session on the server.')) return;
    setBusy('disconnect');
    setFeedback(null);
    const res = await sendToBackground({ type: 'verba:disconnect' });
    setBusy(null);
    if (res.ok) {
      setFeedback({ tone: 'success', text: 'Signed out.' });
      refresh();
    } else {
      setFeedback({ tone: 'error', text: res.error.message });
    }
  }

  async function saveDashboard() {
    if (!dashboardUrl || busy !== null) return;
    setBusy('dashboard');
    setFeedback(null);
    const res = await sendToBackground({ type: 'verba:set-dashboard-url', dashboardUrl });
    setBusy(null);
    if (res.ok) {
      setDashboardDraft(null);
      setFeedback({ tone: 'success', text: 'Dashboard address saved.' });
      refresh();
    } else {
      setFeedback({ tone: 'error', text: res.error.message });
    }
  }

  return (
    <SectionCard
      id="connection"
      title="Connection"
      description="Sign in to link this browser to your Verba account. Your access token stays on this device."
    >
      <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-2/60 p-4">
        <StatusDot tone={status.tone} label={status.label} className="mt-1.5 h-2.5 w-2.5" />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-[14px] font-medium">{connected ? 'Connected' : 'Not connected'}</p>
          <p className="truncate text-[12.5px] text-muted">
            {connected ? `Server: ${state?.apiUrl ?? 'unknown'}` : 'Sign in to sync your settings.'}
          </p>
          {connected && (
            <p className="text-[12px] text-subtle">
              {state?.lastSyncAt ? `Last synced ${relativeTime(state.lastSyncAt)}` : 'Not synced yet'}
            </p>
          )}
          {state?.lastError && (
            <p className="mt-2 rounded-lg bg-danger-soft px-2.5 py-1.5 text-[12px] text-danger">
              Last sync failed: {state.lastError}
            </p>
          )}
        </div>
        {connected && (
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <Button size="sm" variant="outline" icon={RefreshCw} loading={busy === 'sync'} disabled={busy !== null} onClick={() => void syncNow()}>
              Sync now
            </Button>
            <Button
              size="sm"
              variant="outline"
              icon={Unplug}
              loading={busy === 'disconnect'}
              disabled={busy !== null}
              onClick={() => void signOut()}
              className="text-danger"
            >
              Sign out
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[13px] font-semibold">{connected ? 'Connect to another server' : 'Sign in'}</h3>
          <SegmentedControl label="Sign-in method" size="sm" options={TAB_OPTIONS} value={tab} onChange={setTab} />
        </div>

        {tab === 'email' ? (
          <form className="space-y-4" noValidate onSubmit={(e) => void signIn(e)}>
            <Field htmlFor="login-email" label="Email">
              <input
                id="login-email"
                type="email"
                name="email"
                autoComplete="username"
                inputMode="email"
                spellCheck={false}
                maxLength={EMAIL_MAX_LENGTH}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={fieldClass}
              />
            </Field>
            <Field htmlFor="login-password" label="Password">
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  maxLength={PASSWORD_MAX_LENGTH}
                  value={password}
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
            </Field>
            {customServer && (
              <p className="text-[12px] text-muted">Signing in to {serverApiUrl}. Change this under Advanced.</p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
                <a
                  href={`${DEFAULT_DASHBOARD_URL}/signup`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-brand hover:underline"
                >
                  Create an account
                </a>
                <a
                  href={`${DEFAULT_DASHBOARD_URL}/login`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-brand hover:underline"
                >
                  Forgot password?
                </a>
              </div>
              <Button type="submit" icon={LogIn} loading={busy === 'login'} disabled={!canSignIn}>
                Sign in
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <Field
              htmlFor="connection-code"
              label="Connection code"
              hint={
                <>
                  <span>On the website: Account → Connect extension → Create extension code.</span>
                  {codeInvalid && <span className="mt-1 block text-danger">That is not a valid Verba connection code.</span>}
                  {decoded && <span className="mt-1 block text-success">Ready to connect to {decoded.apiUrl}.</span>}
                </>
              }
            >
              <input
                id="connection-code"
                type="text"
                value={code}
                autoComplete="off"
                spellCheck={false}
                placeholder="verba_…"
                onChange={(e) => setCode(e.target.value)}
                className={`${fieldClass} font-mono text-[12px]`}
              />
            </Field>
            <div className="flex justify-end">
              <Button icon={Plug} loading={busy === 'connect'} disabled={!canConnectCode} onClick={() => void connectWithCode()}>
                Connect
              </Button>
            </div>
          </div>
        )}

        {feedback && (
          <div className="space-y-2">
            <Notice tone={feedback.tone}>{feedback.text}</Notice>
            {feedback.website && (
              <Button size="sm" variant="outline" icon={ExternalLink} onClick={() => window.open(websiteUrl, '_blank', 'noopener,noreferrer')}>
                Open website
              </Button>
            )}
          </div>
        )}

        <details className="group rounded-xl border border-border p-4">
          <summary className="cursor-pointer select-none text-[13px] font-medium text-muted hover:text-fg">Advanced</summary>
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                htmlFor="server-url"
                label="Server URL"
                hint={<span>The API address. Keep the default unless you run your own Verba server ({DEFAULT_API_URL}).</span>}
              >
                <input
                  id="server-url"
                  type="url"
                  value={serverUrl}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => setServerUrl(e.target.value)}
                  className={fieldClass}
                />
              </Field>
              <Field htmlFor="access-token" label="Access token" hint={<span>For self-hosted servers only.</span>}>
                <div className="relative">
                  <input
                    id="access-token"
                    type={showToken ? 'text' : 'password'}
                    value={token}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => setToken(e.target.value)}
                    className={`${fieldClass} pr-10`}
                  />
                  <IconButton
                    icon={showToken ? EyeOff : Eye}
                    label={showToken ? 'Hide token' : 'Show token'}
                    size="sm"
                    onClick={() => setShowToken((v) => !v)}
                    className="absolute right-1.5 top-1.5"
                  />
                </div>
              </Field>
            </div>
            <div className="flex justify-end">
              <Button variant="outline" icon={Plug} loading={busy === 'manual'} disabled={!canConnectManual} onClick={() => void connectWithToken()}>
                Connect with token
              </Button>
            </div>

            <Field
              htmlFor="dashboard-url"
              label="Dashboard URL"
              hint={<span>Where “Open dashboard” links go. Default: {DEFAULT_DASHBOARD_URL}.</span>}
            >
              <div className="flex gap-2">
                <input
                  id="dashboard-url"
                  type="url"
                  value={dashboardInput}
                  onChange={(e) => setDashboardDraft(e.target.value)}
                  className={fieldClass}
                />
                {connected && (
                  <Button
                    variant="outline"
                    loading={busy === 'dashboard'}
                    disabled={!dashboardChanged || busy !== null}
                    onClick={() => void saveDashboard()}
                    className="shrink-0"
                  >
                    Save
                  </Button>
                )}
              </div>
            </Field>
          </div>
        </details>
      </div>
    </SectionCard>
  );
}
