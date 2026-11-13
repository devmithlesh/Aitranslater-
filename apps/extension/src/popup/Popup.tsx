import { ExternalLink, Settings } from 'lucide-react';
import { useState } from 'react';
import { connectionStatus, StatusDot } from '../components/ConnectionStatus';
import { localError } from '../components/errors';
import { openDashboard, openOptions } from '../components/navigation';
import { LogoMark } from '../components/Logo';
import { IconButton } from '../components/ui/Button';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Skeleton } from '../components/ui/Spinner';
import { useExtensionState } from '../hooks/useExtensionState';
import { Onboarding } from './Onboarding';
import { TranslatorView } from './translator/TranslatorView';
import type { ExtensionError } from '../shared/messages';

export function Popup() {
  const { state, loading, error, refresh } = useExtensionState();
  const [notice, setNotice] = useState<ExtensionError | null>(null);
  const status = connectionStatus(state);

  async function handleOpenDashboard() {
    const res = await openDashboard();
    setNotice(res.ok ? null : res.error);
  }

  async function handleOpenSettings() {
    const ok = await openOptions();
    setNotice(ok ? null : localError('Could not open Verba settings.'));
  }

  const connected = state?.connected === true;

  return (
    <div className="flex max-h-[580px] min-h-[240px] min-w-0 flex-col overflow-x-hidden bg-bg text-fg">
      <header className="flex min-w-0 items-center gap-2 border-b border-border bg-surface px-3 py-2.5">
        <LogoMark size={22} />
        <span className="text-[14px] font-semibold tracking-tight">Verba</span>
        <StatusDot tone={status.tone} label={status.label} className="ml-0.5" />
        <div className="ml-auto flex items-center gap-0.5">
          <IconButton icon={ExternalLink} label="Open dashboard" size="sm" onClick={() => void handleOpenDashboard()} />
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

        {state && !connected && <Onboarding onConnect={() => void handleOpenSettings()} />}

        {state && connected && (
          <div className="min-w-0 p-3">
            <TranslatorView settings={state.settings} />
          </div>
        )}
      </div>

      <footer className="min-w-0 border-t border-border bg-surface px-3 py-2 text-[11px] leading-4 text-subtle">
        <span className="font-medium text-muted">Alt+Shift+V</span> in any text box to open Verba.
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
