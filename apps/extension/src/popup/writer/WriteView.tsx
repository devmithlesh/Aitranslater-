import {
  WRITE_PROMPT_MAX_LENGTH,
  type CreditStatus,
  type UserSettings,
  type WriteRequest,
  type WriteResponse,
} from '@verba/shared';
import { CornerDownLeft, ExternalLink, KeyRound, RotateCcw, Sparkles } from 'lucide-react';
import { useCallback, useId, useRef, useState } from 'react';
import { localError } from '../../components/errors';
import { LanguageSelect } from '../../components/LanguageSelect';
import { openDashboard } from '../../components/navigation';
import { Kbd } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { cn } from '../../components/ui/cn';
import { CopyButton } from '../../components/ui/CopyButton';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { fieldClass } from '../../components/ui/fieldClass';
import { Skeleton } from '../../components/ui/Spinner';
import { callApi, type ExtensionError } from '../../shared/messages';
import { CreditLimitNotice, CreditsLine, readResetsAt } from '../translator/CreditsLine';
import { useCredits } from '../translator/useCredits';
import { useFieldInsert } from '../shared/useFieldInsert';

const DEFAULT_LANG = 'en';
const NO_FAVORITES: readonly string[] = [];

interface Written {
  /** The request that produced this result. "Ask again" re-runs it. */
  request: WriteRequest;
  text: string;
}

type View =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; error: ExtensionError; credits?: CreditStatus | null }
  | { kind: 'done'; written: Written };

export interface WriteViewProps {
  settings: UserSettings | null;
}

/** Ask anything: answers questions or writes content (a letter, an application, a message), and can insert it into the page. */
export function WriteView({ settings }: WriteViewProps) {
  const favorites = settings?.favoriteLanguages ?? NO_FAVORITES;
  const uid = useId();
  const promptId = `${uid}-prompt`;

  const [prompt, setPrompt] = useState('');
  // Write always starts in English, whatever the translator's target language is.
  const [lang, setLang] = useState(DEFAULT_LANG);
  const { field, inserting, insertError, insert, clearInsertError } = useFieldInsert();
  const [view, setView] = useState<View>({ kind: 'idle' });
  const [dashboardFailed, setDashboardFailed] = useState(false);
  const { credits, refresh: refreshCredits } = useCredits();

  /** Latest request id. Responses to older requests are ignored. */
  const requestSeq = useRef(0);

  const trimmed = prompt.trim();
  const tooLong = prompt.length > WRITE_PROMPT_MAX_LENGTH;
  const canWrite = trimmed.length > 0 && !tooLong && view.kind !== 'loading';

  const run = useCallback(
    async (request: WriteRequest) => {
      const seq = ++requestSeq.current;
      setView({ kind: 'loading' });
      clearInsertError();
      const res = await callApi<WriteResponse>('POST', '/write', request);
      if (!res.ok && res.error.code === 'CREDIT_LIMIT_REACHED') {
        // Wait for the fresh counter so the notice can show the reset time.
        const fresh = await refreshCredits();
        if (seq === requestSeq.current) setView({ kind: 'error', error: res.error, credits: fresh });
        return;
      }
      // Every other attempt also refreshes the counter, without holding up the result.
      void refreshCredits();
      if (seq !== requestSeq.current) return;
      if (!res.ok) {
        setView({ kind: 'error', error: res.error });
        return;
      }
      const text = typeof res.data.result === 'string' ? res.data.result.trim() : '';
      if (text === '') {
        setView({ kind: 'error', error: localError('No answer came back. Try again.') });
        return;
      }
      setView({ kind: 'done', written: { request, text } });
    },
    [refreshCredits, clearInsertError],
  );

  function submit() {
    if (!canWrite) return;
    void run({ prompt: trimmed, targetLang: lang });
  }

  function writeAgain(written: Written) {
    if (view.kind === 'loading') return;
    void run(written.request);
  }

  async function openProviders() {
    const res = await openDashboard('/settings/providers');
    setDashboardFailed(!res.ok);
  }

  const done = view.kind === 'done' ? view.written : null;

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex min-h-4 items-center justify-between gap-2">
        <label htmlFor={promptId} className="min-w-0 flex-1 text-[12.5px] font-medium text-fg">
          Ask Verba anything
        </label>
        <CreditsLine credits={credits} />
      </div>

      <div>
        <textarea
          id={promptId}
          value={prompt}
          rows={4}
          maxLength={WRITE_PROMPT_MAX_LENGTH}
          autoFocus
          placeholder="Ask a question, or tell Verba what to write…"
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          className={cn(fieldClass, 'resize-none leading-5', tooLong && 'border-danger/60')}
        />
        {prompt.length > 0 && (
          <div className={cn('mt-1 text-right text-[10.5px] tabular-nums', tooLong ? 'text-danger' : 'text-subtle')}>
            {prompt.length.toLocaleString()} / {WRITE_PROMPT_MAX_LENGTH.toLocaleString()}
          </div>
        )}
      </div>

      <LanguageSelect label="Answer in" value={lang} onChange={setLang} favorites={favorites} className="w-full" />

      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-[11px] text-subtle" aria-hidden>
          <Kbd>Ctrl</Kbd>
          <Kbd>Enter</Kbd>
        </span>
        <Button icon={Sparkles} loading={view.kind === 'loading'} disabled={!canWrite} onClick={submit}>
          Ask
        </Button>
      </div>

      <div aria-live="polite" className="min-w-0 space-y-3">
        {view.kind === 'loading' && (
          <div className="space-y-2">
            <span className="sr-only">Thinking</span>
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {view.kind === 'error' && view.error.code === 'NO_PROVIDER_CONFIGURED' && (
          <div role="alert" className="flex gap-2.5 rounded-xl border border-danger/20 bg-danger-soft p-3 text-fg animate-fade-in">
            <KeyRound size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden />
            <div className="min-w-0 flex-1 text-[12.5px]">
              <p className="font-medium">Verba AI isn't set up on this server yet.</p>
              <p className="mt-0.5 text-muted">Please let the Verba admin know. Admins: add an AI key in the dashboard.</p>
              <Button variant="outline" size="sm" icon={ExternalLink} className="mt-2" onClick={() => void openProviders()}>
                Admin: AI provider settings
              </Button>
              {dashboardFailed && <p className="mt-1 text-danger">Could not open that page. Try again.</p>}
            </div>
          </div>
        )}

        {view.kind === 'error' && view.error.code === 'CREDIT_LIMIT_REACHED' && (
          <CreditLimitNotice
            limit={view.credits?.limit ?? null}
            resetsAt={view.credits?.resetsAt ?? readResetsAt(view.error.details)}
          />
        )}

        {view.kind === 'error' && view.error.code !== 'NO_PROVIDER_CONFIGURED' && view.error.code !== 'CREDIT_LIMIT_REACHED' && (
          <ErrorMessage error={view.error} onRetry={submit} compact />
        )}

        {done && (
          <section aria-label="Written text" className="animate-slide-up min-w-0 space-y-3">
            <div className="min-w-0 select-text whitespace-pre-wrap break-words rounded-xl border border-border bg-surface p-3 text-[13px] leading-5 text-fg shadow-card">
              {done.text}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => writeAgain(done)}>
                Ask again
              </Button>
              <CopyButton text={done.text} />
              {field && (
                <Button
                  icon={CornerDownLeft}
                  loading={inserting}
                  disabled={inserting}
                  onClick={() => void insert(done.text)}
                >
                  Insert
                </Button>
              )}
            </div>
            {insertError && (
              <p role="alert" className="break-words text-[12px] text-danger">
                {insertError}
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
