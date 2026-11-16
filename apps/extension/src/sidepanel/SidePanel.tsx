import { RefreshCw, Settings } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_EXPLAIN_LANGUAGE,
  EXPLAIN_QUICK_LANGUAGES,
  HINGLISH,
  LANGUAGES,
  explainLanguageLabel,
  isExplainLanguage,
  type ExplainLanguage,
  type ExplainRequest,
  type ExplainResponse,
} from '@verba/shared';
import { connectionStatus, StatusDot } from '../components/ConnectionStatus';
import { localError } from '../components/errors';
import { openOptions } from '../components/navigation';
import { LogoMark } from '../components/Logo';
import { Button, IconButton } from '../components/ui/Button';
import { CopyButton } from '../components/ui/CopyButton';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { fieldClass } from '../components/ui/fieldClass';
import { SegmentedControl, type SegmentOption } from '../components/ui/SegmentedControl';
import { Skeleton, Spinner } from '../components/ui/Spinner';
import { useExtensionState } from '../hooks/useExtensionState';
import { useStoredValue } from '../hooks/useStoredValue';
import { EXPLAIN_LANGUAGE_KEY, type PendingExplain } from '../shared/explain';
import { callApi, type ExtensionError } from '../shared/messages';
import { ExplanationText } from './ExplanationText';
import { usePendingExplain } from './usePendingExplain';

const PREVIEW_CHARS = 300;

const QUICK_OPTIONS: readonly SegmentOption<ExplainLanguage>[] = EXPLAIN_QUICK_LANGUAGES.map(
  (value): SegmentOption<ExplainLanguage> => ({ value, label: explainLanguageLabel(value) }),
);

/** Hinglish first, then every supported language with its native name. */
const ALL_LANGUAGE_OPTIONS: readonly { code: ExplainLanguage; label: string }[] = [
  { code: HINGLISH, label: 'Hinglish' },
  ...LANGUAGES.map((l) => ({ code: l.code, label: `${l.nativeName} (${l.name})` })),
];

function loadingText(language: ExplainLanguage): string {
  return language === HINGLISH ? 'Samjha raha hoon…' : 'Explaining…';
}

type ExplainView =
  | { key: string; status: 'loading' }
  | { key: string; status: 'done'; data: ExplainResponse }
  | { key: string; status: 'error'; error: ExtensionError };

/** Identifies one explanation run; a change in any part means the card must reload. */
function requestKey(pending: PendingExplain, language: ExplainLanguage, nonce: number): string {
  return `${pending.requestedAt}|${language}|${nonce}`;
}

export function SidePanel() {
  const pending = usePendingExplain();
  const [language, setLanguage, languageLoaded] = useStoredValue(
    EXPLAIN_LANGUAGE_KEY,
    DEFAULT_EXPLAIN_LANGUAGE,
    isExplainLanguage,
  );
  const { state } = useExtensionState();
  const [view, setView] = useState<ExplainView>({ key: '', status: 'loading' });
  const [nonce, setNonce] = useState(0);
  const [notice, setNotice] = useState<ExtensionError | null>(null);
  const requestSeq = useRef(0);

  const status = connectionStatus(state);
  const connected = state?.connected === true;

  // Runs when the selection, the language or an explicit "Explain again" changes.
  // Responses from superseded requests are dropped via the sequence check and the cleanup.
  useEffect(() => {
    if (!languageLoaded || !pending) return;
    const id = ++requestSeq.current;
    const key = requestKey(pending, language, nonce);
    setView({ key, status: 'loading' });

    const body: ExplainRequest = { text: pending.text, language };
    callApi<ExplainResponse>('POST', '/explain', body)
      .then((res) => {
        if (id !== requestSeq.current) return;
        setView(res.ok ? { key, status: 'done', data: res.data } : { key, status: 'error', error: res.error });
      })
      .catch(() => {
        if (id !== requestSeq.current) return;
        setView({ key, status: 'error', error: localError('Verba did not respond. Try again.') });
      });

    return () => {
      requestSeq.current += 1;
    };
  }, [pending, language, languageLoaded, nonce]);

  const rerun = () => setNonce((n) => n + 1);

  async function handleOpenSettings() {
    const ok = await openOptions();
    setNotice(ok ? null : localError('Could not open Verba settings.'));
  }

  const currentKey = pending && languageLoaded ? requestKey(pending, language, nonce) : null;
  const current = currentKey !== null && view.key === currentKey ? view : null;

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-bg text-fg">
      <header className="flex min-w-0 items-center gap-2 border-b border-border bg-surface px-3 py-2.5">
        <LogoMark size={22} />
        <span className="text-[14px] font-semibold tracking-tight">Verba</span>
        <span className="text-[13px] text-muted">Explain</span>
        <StatusDot tone={status.tone} label={status.label} className="ml-0.5" />
        <div className="ml-auto flex items-center gap-0.5">
          <IconButton icon={Settings} label="Settings" size="sm" onClick={() => void handleOpenSettings()} />
        </div>
      </header>

      <main className="min-w-0 flex-1 space-y-3 p-3">
        {notice && <ErrorMessage error={notice} compact />}

        <div className="space-y-2">
          <SegmentedControl
            label="Quick language"
            options={QUICK_OPTIONS}
            value={language}
            onChange={(value) => setLanguage(value)}
            size="sm"
            className="w-full"
          />
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-muted">Language</span>
            <select
              className={fieldClass}
              value={language}
              onChange={(e) => {
                if (isExplainLanguage(e.target.value)) setLanguage(e.target.value);
              }}
            >
              {ALL_LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {!pending && <EmptyState connected={connected} hasState={state !== null} />}

        {pending && (
          <>
            <SelectedText key={pending.requestedAt} text={pending.text} site={pending.site} />

            <div aria-live="polite" className="min-w-0 space-y-3">
              {(!current || current.status === 'loading') && <LoadingCard language={language} />}

              {current?.status === 'error' && (
                <ErrorMessage error={current.error} onRetry={rerun} />
              )}

              {current?.status === 'done' && (
                <ResultCard data={current.data} onAgain={rerun} />
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function EmptyState({ connected, hasState }: { connected: boolean; hasState: boolean }) {
  return (
    <div className="space-y-3 rounded-xl border border-dashed border-border bg-surface p-4 text-center">
      <p className="text-[13.5px] leading-6 text-fg">
        Select any text on a page, PDF or document, right-click and choose{' '}
        <strong className="font-semibold">Explain with Verba</strong>.
      </p>
      <p className="text-[12px] leading-5 text-subtle">
        Works on websites, social media, PDFs and files opened in Chrome.
      </p>
      {hasState && !connected && (
        <div className="pt-1 text-left">
          <ErrorMessage error={{ code: 'NOT_CONNECTED', message: 'Connect Verba to use Explain.' }} compact />
        </div>
      )}
    </div>
  );
}

function SelectedText({ text, site }: { text: string; site: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > PREVIEW_CHARS;
  const shown = long && !expanded ? `${text.slice(0, PREVIEW_CHARS).trimEnd()}…` : text;

  return (
    <section aria-label="Selected text" className="min-w-0 rounded-xl border border-border bg-surface-2 p-3">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-subtle">You selected</h2>
        {site && (
          <span className="min-w-0 truncate text-[11px] text-subtle" title={site}>
            {site}
          </span>
        )}
      </div>
      <p className="mt-1.5 whitespace-pre-wrap break-words text-[12.5px] leading-5 text-muted">{shown}</p>
      {long && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 text-[12px] font-medium text-brand hover:underline"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </section>
  );
}

function LoadingCard({ language }: { language: ExplainLanguage }) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-3">
      <div className="flex items-center gap-2 text-[13px] text-muted">
        <Spinner size={16} className="text-brand" />
        <span>{loadingText(language)}</span>
      </div>
      <div className="space-y-2" aria-hidden>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-3 w-4/6" />
      </div>
    </div>
  );
}

function ResultCard({ data, onAgain }: { data: ExplainResponse; onAgain: () => void }) {
  const origin = [data.provider, data.model].filter(Boolean).join(' · ');
  return (
    <section aria-label="Explanation" className="min-w-0 space-y-3 rounded-xl border border-border bg-surface p-3 shadow-card">
      <ExplanationText text={data.result} />
      <div className="flex flex-wrap items-center gap-2">
        <CopyButton text={data.result} label="Copy" />
        <Button variant="outline" size="sm" icon={RefreshCw} onClick={onAgain} aria-label="Explain again">
          Explain again
        </Button>
      </div>
      {origin && <p className="text-[11px] text-subtle">Answered by {origin}</p>}
    </section>
  );
}
