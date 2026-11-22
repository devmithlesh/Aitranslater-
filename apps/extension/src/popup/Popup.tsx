import { ArrowLeft, ExternalLink, LogIn, LogOut, MessageSquarePlus, Settings } from 'lucide-react';
import { useState } from 'react';
import { connectionStatus, StatusDot } from '../components/ConnectionStatus';
import { localError } from '../components/errors';
import { openDashboard, openOptions } from '../components/navigation';
import { LogoMark } from '../components/Logo';
import { IconButton } from '../components/ui/Button';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Skeleton } from '../components/ui/Spinner';
import { useExtensionState } from '../hooks/useExtensionState';
import { sendToBackground, type ExtensionError } from '../shared/messages';
import { AuthPanel, type AuthMode } from './AuthPanel';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { ExplainSelectionCard } from './ExplainSelectionCard';
import { GuestProvider } from './shared/guest';
import { FeedbackPanel } from './feedback/FeedbackPanel';
import { TranslatorView } from './translator/TranslatorView';
import { WriteView } from './writer/WriteView';

export function Popup() {
  const { state, loading, error, refresh } = useExtensionState();
  const [notice, setNotice] = useState<ExtensionError | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [signingOut, setSigningOut] = useState(false);
  const [tab, setTab] = useState<'translate' | 'write'>('translate');
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  /** Signed-out visitors use the tools first; this swaps them for the sign-in form. */
  const [authOpen, setAuthOpen] = useState(false);
  const status = connectionStatus(state);

  async function handleOpenDashboard() {
    const res = await openDashboard();
    setNotice(res.ok ? null : res.error);
  }

  async function handleOpenSettings() {
    const ok = await openOptions();
    setNotice(ok ? null : localError('Could not open Verba settings.'));
  }

  async function handleSignOut() {
    setSigningOut(true);
    const res = await sendToBackground({ type: 'verba:disconnect' });
    setSigningOut(false);
    setNotice(res.ok ? null : res.error);
    refresh();
  }

  const connected = state?.connected === true;
  const signedOutReady = state !== null && !connected;
  const guestValue = {
    isGuest: signedOutReady,
    openAuth: (mode: AuthMode) => {
      setAuthMode(mode);
      setAuthOpen(true);
    },
  };

  return (
    <div className="flex max-h-[580px] min-h-[240px] min-w-0 flex-col overflow-x-hidden bg-bg text-fg">
      <header className="flex min-w-0 items-center gap-2 border-b border-border bg-surface px-3 py-2.5">
        <LogoMark size={22} />
        <span className="text-[14px] font-semibold tracking-tight">Verba</span>
        <StatusDot tone={status.tone} label={status.label} className="ml-0.5" />
        <div className="ml-auto flex items-center gap-0.5">
          {signedOutReady && (
            // Free use comes first: this opens the form, and the same spot takes the visitor back.
            <button
              type="button"
              onClick={() => {
                setAuthMode('signin');
                setAuthOpen((open) => !open);
              }}
              className="mr-1 inline-flex h-6 items-center gap-1 rounded-md bg-brand-gradient px-2.5 text-[11.5px] font-semibold text-brand-fg transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              {authOpen ? <ArrowLeft size={12} aria-hidden /> : <LogIn size={12} aria-hidden />}
              {authOpen ? 'Back' : 'Sign in'}
            </button>
          )}
          {connected && (
            <>
              <IconButton
                icon={MessageSquarePlus}
                label="Send feedback"
                size="sm"
                active={feedbackOpen}
                onClick={() => setFeedbackOpen((open) => !open)}
              />
              <IconButton icon={ExternalLink} label="Open dashboard" size="sm" onClick={() => void handleOpenDashboard()} />
              <IconButton
                icon={LogOut}
                label="Sign out"
                size="sm"
                disabled={signingOut}
                aria-busy={signingOut || undefined}
                onClick={() => void handleSignOut()}
              />
            </>
          )}
          <IconButton icon={Settings} label="Settings" size="sm" onClick={() => void handleOpenSettings()} />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {notice && (
          <div className="px-3 pt-3">
            <ErrorMessage error={notice} compact />
          </div>
        )}

        {loading && !state && <PopupSkeleton />}

        {!loading && !state && (
          <div className="p-3">
            <ErrorMessage
              error={error ?? localError('Verba did not respond. Try again.')}
              onRetry={refresh}
            />
          </div>
        )}

        {state && !connected && authOpen && (
          <AuthPanel
            mode={authMode}
            onModeChange={setAuthMode}
            onSignedIn={() => {
              setAuthOpen(false);
              refresh();
            }}
          />
        )}

        {state && connected && feedbackOpen && <FeedbackPanel onBack={() => setFeedbackOpen(false)} />}

        {state && (
          <GuestProvider value={guestValue}>
          {/* Hidden, not unmounted, while a visitor signs in: what they typed and the result stay for when they come back. */}
          <div hidden={feedbackOpen || (!connected && authOpen)} className="min-w-0 space-y-4 p-4">
            <SegmentedControl
              label="Verba mode"
              size="sm"
              className="w-full"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'translate', label: 'Translate' },
                { value: 'write', label: 'Ask AI' },
              ]}
            />
            {/* Hidden, not unmounted: remounting would re-run the translator's auto-translate and spend a credit. */}
            <div hidden={tab !== 'translate'} className="space-y-3">
              <ExplainSelectionCard settings={state.settings} />
              <TranslatorView settings={state.settings} active={tab === 'translate' && !feedbackOpen} />
            </div>
            <div hidden={tab !== 'write'}>
              <WriteView settings={state.settings} active={tab === 'write' && !feedbackOpen} />
            </div>
          </div>
          </GuestProvider>
        )}
      </div>

      <footer className="min-w-0 border-t border-border bg-surface px-3 py-2 text-[11px] leading-4 text-subtle">
        <span className="font-medium text-muted">Alt+Shift+V</span> in any text box · select text, then{' '}
        <span className="font-medium text-muted">right-click → Explain</span>
      </footer>
    </div>
  );
}

function PopupSkeleton() {
  return (
    <div className="space-y-3 p-3" aria-label="Loading Verba">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-8 w-2/3" />
    </div>
  );
}
