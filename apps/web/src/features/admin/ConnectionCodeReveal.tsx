import { AlertTriangle, KeyRound } from 'lucide-react';
import { useId } from 'react';
import { Button, Card, CopyButton } from '@/components/ui';
import type { RevealedCode } from './connectionCode';

/** The one-time connection code. Dismissing it (or leaving the page) discards it for good. */
export function ConnectionCodeReveal({
  name,
  code,
  local,
  onDismiss,
}: RevealedCode & { onDismiss: () => void }) {
  const headingId = useId();
  return (
    <Card role="region" aria-labelledby={headingId} className="space-y-4 border-brand/30 p-5 animate-fade-in">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <KeyRound size={17} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className="break-words text-[15px] font-semibold text-fg">
            Connection code for {name}
          </h3>
          <p className="mt-0.5 break-words text-[13px] text-muted">
            Shown only once — copy it now and send it to {name}.
          </p>
        </div>
      </div>

      {local && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-warning/20 bg-warning-soft p-3 text-[12.5px] text-fg">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden />
          <span className="min-w-0">
            This code points to localhost — it only works on this computer until the server is hosted.
          </span>
        </p>
      )}

      <code className="block break-all rounded-xl border border-border bg-surface-2 p-3 font-mono text-[12.5px] leading-relaxed text-fg">
        {code}
      </code>

      <div className="flex flex-wrap items-center gap-2">
        <CopyButton text={code} label="Copy code" size="md" variant="secondary" />
        <Button variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </Card>
  );
}
