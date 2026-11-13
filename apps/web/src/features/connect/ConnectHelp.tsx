import { KeyRound } from 'lucide-react';
import { CopyButton } from '@/components/ui';

const TOKEN_COMMAND = 'npm run token -w @verba/backend';

export function ConnectHelp() {
  return (
    <section aria-labelledby="connect-help" className="border-t border-border bg-surface-2/50 px-6 py-5 sm:px-8">
      <div className="flex items-start gap-3">
        <KeyRound size={16} className="mt-0.5 shrink-0 text-brand" aria-hidden />
        <div className="min-w-0 flex-1 space-y-2.5">
          <h2 id="connect-help" className="text-[13.5px] font-semibold text-fg">
            Where do I find my token?
          </h2>
          <p className="text-[13px] leading-relaxed text-muted">
            It is printed in the backend console on first start. You can also generate a new one at any time:
          </p>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-1.5 pl-3">
            <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-fg">{TOKEN_COMMAND}</code>
            <CopyButton text={TOKEN_COMMAND} label="Copy" variant="ghost" />
          </div>
        </div>
      </div>
    </section>
  );
}
