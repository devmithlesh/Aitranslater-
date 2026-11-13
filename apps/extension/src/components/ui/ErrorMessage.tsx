import { AlertTriangle, KeyRound, RefreshCw, WifiOff, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import type { ExtensionError } from '../../shared/messages';
import { describeError, type ErrorAction } from '../errors';
import { openDashboard, openOptions } from '../navigation';
import { cn } from './cn';
import { Button } from './Button';

/** Renders an ExtensionError with a tailored hint and the matching recovery action. */
export function ErrorMessage({
  error,
  onRetry,
  compact,
  className,
}: {
  error: ExtensionError;
  onRetry?: () => void;
  compact?: boolean;
  className?: string;
}) {
  const view = describeError(error);
  const action = view.action;
  const [actionFailed, setActionFailed] = useState(false);
  const Icon: LucideIcon =
    error.code === 'NETWORK_ERROR' ? WifiOff : error.code === 'NO_PROVIDER_CONFIGURED' ? KeyRound : AlertTriangle;

  async function runAction(action: ErrorAction) {
    setActionFailed(false);
    const ok = action.kind === 'options' ? await openOptions() : (await openDashboard(action.path)).ok;
    if (!ok) setActionFailed(true);
  }

  return (
    <div
      role="alert"
      className={cn(
        'flex gap-2.5 rounded-xl border border-danger/20 bg-danger-soft text-fg animate-fade-in',
        compact ? 'items-center p-2.5' : 'items-start p-3',
        className,
      )}
    >
      <Icon size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden />
      <div className="min-w-0 flex-1 text-[12.5px]">
        <p className="font-medium">{view.message}</p>
        {view.hint && <p className="mt-0.5 text-muted">{view.hint}</p>}
        {actionFailed && <p className="mt-0.5 text-danger">Could not open that page. Try again.</p>}
        {action && (
          <Button variant="outline" size="sm" className="mt-2" onClick={() => runAction(action)}>
            {action.label}
          </Button>
        )}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" icon={RefreshCw} onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
