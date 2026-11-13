import { AlertTriangle, KeyRound } from 'lucide-react';
import { useId } from 'react';
import { Button, Card, CopyButton } from '@/components/ui';

/** A freshly issued temporary password. Lives only in the Users page state; never persisted. */
export interface RevealedPassword {
  name: string;
  password: string;
}

/** The one-time temporary password for a new or reset account. Dismissing it discards it for good. */
export function TemporaryPasswordReveal({
  name,
  password,
  onDismiss,
}: RevealedPassword & { onDismiss: () => void }) {
  const headingId = useId();
  return (
    <Card role="region" aria-labelledby={headingId} className="space-y-4 border-brand/30 p-5 animate-fade-in">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <KeyRound size={17} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className="break-words text-[15px] font-semibold text-fg">
            Temporary password for {name}
          </h3>
          <p className="mt-0.5 break-words text-[13px] text-muted">
            Shown only once. Send this to {name}; they must change it at first sign-in.
          </p>
        </div>
      </div>

      <p role="note" className="flex items-start gap-2 rounded-xl border border-warning/20 bg-warning-soft p-3 text-[12.5px] text-fg">
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden />
        <span className="min-w-0">Copy it now. It cannot be shown again; you can reset it later if needed.</span>
      </p>

      <code className="block break-all rounded-xl border border-border bg-surface-2 p-3 font-mono text-[13px] leading-relaxed text-fg">
        {password}
      </code>

      <div className="flex flex-wrap items-center gap-2">
        <CopyButton text={password} label="Copy password" size="md" variant="secondary" />
        <Button variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </Card>
  );
}
