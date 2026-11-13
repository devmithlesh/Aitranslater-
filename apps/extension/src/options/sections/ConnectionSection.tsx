import { decodeConnectionCode, normalizeApiUrl } from '@verba/shared';
import { Eye, EyeOff, Plug, RefreshCw, Unplug } from 'lucide-react';
import { useMemo, useState } from 'react';
import { connectionStatus, StatusDot } from '../../components/ConnectionStatus';
import { relativeTime } from '../../components/format';
import { Button, IconButton } from '../../components/ui/Button';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { fieldClass } from '../../components/ui/fieldClass';
import { DEFAULT_DASHBOARD_URL, sendToBackground, type ExtensionState } from '../../shared/messages';
import { isLocalUrl, isHttpUrl, parseHttpUrl } from '../validation';
import { Field, Notice, SectionCard } from './SectionCard';

type Mode = 'code' | 'manual';
type Busy = 'connect' | 'sync' | 'disconnect' | 'dashboard' | null;

const MODE_OPTIONS = [
  { value: 'code', label: 'Connection code' },
  { value: 'manual', label: 'URL + token' },
] as const;

const DEFAULT_SERVER_URL = 'http://localhost:8787';

interface Feedback {
  tone: 'success' | 'error';
  text: string;
}

/**
 * Asks for host permission for a non-local server. Must be the first thing that
 * runs in the click handler so the user gesture is still valid.
 */
function requestServerPermission(apiUrl: string): Promise<boolean> {
  const origin = new URL(apiUrl).origin;
  return chrome.permissions.request({ origins: [`${origin}/*`] }).catch(() => false);
}

export function ConnectionSection({ state, refresh }: { state: ExtensionState | null; refresh: () => void }) {
  const connected = state?.connected === true;
  const status = connectionStatus(state);

  const [mode, setMode] = useState<Mode>('code');
  const [code, setCode] = useState('');
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [dashboardDraft, setDashboardDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const savedDashboard = state?.dashboardUrl ?? DEFAULT_DASHBOARD_URL;
  const dashboardInput = dashboardDraft ?? savedDashboard;
  const dashboardUrl = parseHttpUrl(dashboardInput);
  const dashboardChanged = dashboardUrl !== null && dashboardUrl !== savedDashboard;

  const decoded = useMemo(() => (code.trim() ? decodeConnectionCode(code) : null), [code]);
  const codeInvalid = code.trim().length > 0 && decoded === null;

  const manualApiUrl = normalizeApiUrl(serverUrl);
  const manualValid = isHttpUrl(manualApiUrl) && token.trim().length > 0;
  const target = mode === 'code' ? decoded : manualValid ? { apiUrl: manualApiUrl, token: token.trim() } : null;

  const canConnect = target !== null && dashboardUrl !== null && busy === null;

  async function connect() {
    // All validation runs synchronously above; only the permission prompt awaits before the request.
    if (!target || !dashboardUrl || busy !== null) return;
    setBusy('connect');
    setFeedback(null);

    if (!isLocalUrl(target.apiUrl)) {
      const granted = await requestServerPermission(target.apiUrl);
      if (!granted) {
        setBusy(null);
        setFeedback({ tone: 'error', text: 'Permission is required to reach your server.' });
        return;
      }
    }

    const res =
      mode === 'code'
        ? await sendToBackground({ type: 'verba:connect', code: code.trim(), dashboardUrl })
        : await sendToBackground({ type: 'verba:connect', apiUrl: target.apiUrl, token: target.token, dashboardUrl });

    setBusy(null);
    if (res.ok) {
      setCode('');
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

  async function disconnect() {
    if (!window.confirm('Disconnect Verba on this device? You can reconnect any time with a connection code.')) return;
    setBusy('disconnect');
    setFeedback(null);
    const res = await sendToBackground({ type: 'verba:disconnect' });
    setBusy(null);
    if (res.ok) {
      setFeedback({ tone: 'success', text: 'Disconnected.' });
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
    <SectionCard id="connection" title="Connection" description="Link this browser to your Verba server. Your access token stays on this device.">
      <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-2/60 p-4">
        <StatusDot tone={status.tone} label={status.label} className="mt-1.5 h-2.5 w-2.5" />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-[14px] font-medium">{connected ? 'Connected' : 'Not connected'}</p>
          <p className="truncate text-[12.5px] text-muted">
            {connected ? `Server: ${state?.apiUrl ?? 'unknown'}` : 'Connect to a Verba server to sync your settings.'}
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
              onClick={() => void disconnect()}
              className="text-danger"
            >
              Disconnect
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[13px] font-semibold">{connected ? 'Connect to another server' : 'Connect'}</h3>
          <SegmentedControl label="Connection method" size="sm" options={MODE_OPTIONS} value={mode} onChange={setMode} />
        </div>

        {mode === 'code' ? (
          <Field
            htmlFor="connection-code"
            label="Connection code"
            hint={
              <>
                <span>Find the connection code in the dashboard → Settings → Extension.</span>
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
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              htmlFor="server-url"
              label="Server URL"
              hint={<span>The API address, for example {DEFAULT_SERVER_URL}.</span>}
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
            <Field htmlFor="access-token" label="Access token">
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
        )}

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

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">{feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}</div>
          <Button icon={Plug} loading={busy === 'connect'} disabled={!canConnect} onClick={() => void connect()}>
            {connected ? 'Connect' : 'Connect Verba'}
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}
