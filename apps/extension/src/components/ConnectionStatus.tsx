import type { ExtensionState } from '../shared/messages';
import { relativeTime, truncate } from './format';
import { cn } from './ui/cn';

export type StatusTone = 'success' | 'warning' | 'muted';

export interface ConnectionStatusInfo {
  tone: StatusTone;
  label: string;
}

/** Derives the dot colour and tooltip from the cached extension state. */
export function connectionStatus(state: ExtensionState | null): ConnectionStatusInfo {
  if (!state || !state.connected) return { tone: 'muted', label: 'Not connected' };
  if (state.lastError) return { tone: 'warning', label: `Sync problem: ${truncate(state.lastError, 120)}` };
  if (!state.lastSyncAt) return { tone: 'warning', label: 'Connected, waiting for first sync' };
  return { tone: 'success', label: `Connected, synced ${relativeTime(state.lastSyncAt)}` };
}

const dotTones: Record<StatusTone, string> = {
  success: 'bg-success shadow-[0_0_0_3px_rgb(var(--success)/0.18)]',
  warning: 'bg-warning shadow-[0_0_0_3px_rgb(var(--warning)/0.18)]',
  muted: 'bg-subtle',
};

export function StatusDot({ tone, label, className }: { tone: StatusTone; label: string; className?: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      className={cn('inline-block h-2 w-2 shrink-0 rounded-full', dotTones[tone], className)}
    />
  );
}
