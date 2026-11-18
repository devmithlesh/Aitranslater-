import { ExternalLink, RefreshCw, Unplug } from 'lucide-react';
import { useState } from 'react';
import { connectionStatus, StatusDot } from '../../components/ConnectionStatus';
import { relativeTime } from '../../components/format';
import { openDashboard } from '../../components/navigation';
import { Button } from '../../components/ui/Button';
import { sendToBackground, type ExtensionState } from '../../shared/messages';
import { Notice, SectionCard } from './SectionCard';

type Busy = 'sync' | 'disconnect' | null;

interface Feedback {
  tone: 'success' | 'error';
  text: string;
}

export function ConnectionSection({ state, refresh }: { state: ExtensionState | null; refresh: () => void }) {
  const connected = state?.connected === true;
  const status = connectionStatus(state);

  const [busy, setBusy] = useState<Busy>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

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

  /** Opens the website sign-in page for this extension. The state listener updates this page once connected. */
  async function signInOnWebsite() {
    setFeedback(null);
    const res = await openDashboard(`/extension/connect?ext=${chrome.runtime.id}`);
    if (!res.ok) setFeedback({ tone: 'error', text: res.error.message });
  }

  return (
    <SectionCard
      id="connection"
      title="Account"
      description={
        connected
          ? 'This browser is signed in to your Verba account.'
          : 'Sign in to sync your settings and start translating.'
      }
    >
      <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-2/60 p-4">
        <StatusDot tone={status.tone} label={status.label} className="mt-1.5 h-2.5 w-2.5" />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-[14px] font-medium">{connected ? 'Signed in' : 'Not connected'}</p>
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

      {!connected && (
        <div className="space-y-3 rounded-xl border border-border p-4">
          <p className="text-[13px] text-muted">
            Click the Verba icon in your Chrome toolbar to sign in or create a free account.
          </p>
          <Button variant="outline" size="sm" icon={ExternalLink} onClick={() => void signInOnWebsite()}>
            Sign in on the website
          </Button>
          <p className="text-[12px] text-subtle">This page updates by itself once you&apos;re signed in.</p>
        </div>
      )}

      {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}
    </SectionCard>
  );
}
