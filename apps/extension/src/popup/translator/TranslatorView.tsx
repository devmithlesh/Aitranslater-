import {
  AUTO_LANGUAGE,
  languageName,
  MAX_INPUT_CHARS,
  type CreditStatus,
  type TranslateVariantsResponse,
  type UserSettings,
} from '@verba/shared';
import { ArrowLeftRight, CornerDownLeft, Eraser, ExternalLink, KeyRound, Languages } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { localError } from '../../components/errors';
import { LanguageSelect } from '../../components/LanguageSelect';
import { openDashboard } from '../../components/navigation';
import { Badge, Kbd } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { CopyButton } from '../../components/ui/CopyButton';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { fieldClass } from '../../components/ui/fieldClass';
import { cn } from '../../components/ui/cn';
import { Skeleton } from '../../components/ui/Spinner';
import { isString } from '../../hooks/guards';
import { useStoredValue } from '../../hooks/useStoredValue';
import { callApi, type ExtensionError } from '../../shared/messages';
import { MicButton, SpeechNotice } from '../shared/MicButton';
import { useSpeechInput } from '../shared/speech';
import { insertIntoField, readFocusedField, readPageSelection, type FocusedField } from './pageBridgeClient';
import { CreditLimitNotice, CreditsLine, readResetsAt } from './CreditsLine';
import { useCredits } from './useCredits';
import { VariantTabs } from './VariantTabs';

/** chrome.storage.local keys owned by the translator view (per device). */
const TARGET_STORAGE_KEY = 'verba.popup.target';
const VARIANT_STORAGE_KEY = 'verba.popup.variant';
const DEFAULT_TARGET = 'en';
const DEFAULT_SOURCE = 'hi';
const NO_FAVORITES: readonly string[] = [];

/** Same words ignoring spacing and case, so a selection matches the box it was highlighted in. */
function sameText(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const x = norm(a);
  return x.length > 0 && x === norm(b);
}

interface Translation {
  /** The source language the request used ("auto" when it was detected). */
  sourceLang: string;
  /** The target language the request used. Results are labelled with this, not with the current select value. */
  targetLang: string;
  data: TranslateVariantsResponse;
}

type View =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; error: ExtensionError; credits?: CreditStatus | null }
  | { kind: 'done'; translation: Translation };

export interface TranslatorViewProps {
  settings: UserSettings | null;
  /** False while another tab is showing: the microphone must not keep typing into a box nobody can see. */
  active?: boolean;
}

/** Prefilled from the focused text box on the page, translates it into several tones, and inserts the chosen one back. */
export function TranslatorView({ settings, active = true }: TranslatorViewProps) {
  const favorites = settings?.favoriteLanguages ?? NO_FAVORITES;
  const uid = useId();

  const [text, setText] = useState('');
  /** undefined while reading the page, null when there is no text box, otherwise the focused field. */
  const [field, setField] = useState<FocusedField | null | undefined>(undefined);
  const [target, setTarget, targetLoaded] = useStoredValue<string>(TARGET_STORAGE_KEY, DEFAULT_TARGET, isString);
  // Not remembered between opens: a leftover "Hinglish" would mistranslate plain English. Starts as Hindi → English.
  const [source, setSource] = useState<string>(DEFAULT_SOURCE);
  /** What the last successful translation used ("text|from|to"). Translate stays off until one of them changes. */
  const [ranKey, setRanKey] = useState('');
  const speech = useSpeechInput(source === AUTO_LANGUAGE ? 'en' : source, setText);
  const [selectedStyle, setSelectedStyle] = useStoredValue<string>(VARIANT_STORAGE_KEY, '', isString);
  const [view, setView] = useState<View>({ kind: 'idle' });
  const [inserting, setInserting] = useState(false);
  const [insertError, setInsertError] = useState<string | null>(null);
  const [dashboardFailed, setDashboardFailed] = useState(false);
  const { credits, refresh: refreshCredits } = useCredits();

  /** Latest request id. Responses to older requests are ignored. */
  const requestSeq = useRef(0);
  const autoRan = useRef(false);

  const trimmed = text.trim();
  const tooLong = text.length > MAX_INPUT_CHARS;
  const currentKey = `${trimmed}|${source}|${target}`;
  // The same text with the same languages would give the same result and spend another credit.
  const canTranslate = trimmed.length > 0 && !tooLong && view.kind !== 'loading' && !(view.kind === 'done' && currentKey === ranKey);

  const run = useCallback(
    async (sourceText: string, from: string, lang: string) => {
      const seq = ++requestSeq.current;
      setView({ kind: 'loading' });
      setInsertError(null);
      const res = await callApi<TranslateVariantsResponse>('POST', '/translate-variants', {
        text: sourceText,
        sourceLang: from,
        targetLang: lang,
      });
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
      if (!Array.isArray(res.data.variants) || res.data.variants.length === 0) {
        setView({ kind: 'error', error: localError('No translations came back. Try again.') });
        return;
      }
      setRanKey(`${sourceText}|${from}|${lang}`);
      setView({ kind: 'done', translation: { sourceLang: from, targetLang: lang, data: res.data } });
    },
    [refreshCredits],
  );

  const stopSpeech = speech.abort;
  useEffect(() => {
    if (!active) stopSpeech();
  }, [active, stopSpeech]);

  // Read the focused text box once on open.
  useEffect(() => {
    let alive = true;
    void Promise.all([readFocusedField(), readPageSelection()]).then(([found, selected]) => {
      if (!alive) return;
      // The "You selected" card already shows highlighted text, so do not copy it into this box as well.
      const dup = found && selected && sameText(found.info.text, selected.info.text);
      setField(found && dup ? { ...found, info: { ...found.info, text: '' } } : found);
      // A box Verba picked itself (the user never clicked it) is only an insert target: never prefill from it.
      if (found && !found.info.guessed && !dup) setText((prev) => (prev === '' ? found.info.text : prev));
    });
    return () => {
      alive = false;
    };
  }, []);

  // Auto-translate the prefilled text once, after both the page text and the remembered language are known.
  useEffect(() => {
    if (autoRan.current || requestSeq.current > 0 || field === undefined || !targetLoaded) return;
    autoRan.current = true;
    if (field && !field.info.guessed && field.info.text.trim()) {
      void run(field.info.text.trim(), source, target);
    }
  }, [field, targetLoaded, target, source, run]);

  function translate() {
    if (!canTranslate) return;
    speech.abort();
    void run(trimmed, source, target);
  }

  const detected = view.kind === 'done' ? view.translation.data.detectedSourceLang : undefined;
  /** Swapping needs a known "from" language: the chosen one, or the one Verba detected. */
  const swapFrom = source === AUTO_LANGUAGE ? detected : source;
  /** Starts fresh: empties the box, drops the result and ignores any request still in flight. */
  function clearAll() {
    speech.abort();
    requestSeq.current++;
    setText('');
    setView({ kind: 'idle' });
    setRanKey('');
    setInsertError(null);
  }

  function swapLanguages() {
    if (!swapFrom) return;
    setSource(target);
    setTarget(swapFrom);
  }

  async function openProviders() {
    const res = await openDashboard('/settings/providers');
    setDashboardFailed(!res.ok);
  }

  async function insert(variantText: string) {
    if (!field || inserting) return;
    setInserting(true);
    setInsertError(null);
    const res = await insertIntoField(field.tabId, field.frameId, variantText);
    if (res.ok) {
      window.close();
      return;
    }
    // Never leave the user with nothing: keep the text on the clipboard so they can paste it.
    let copied = false;
    try {
      await navigator.clipboard.writeText(variantText);
      copied = true;
    } catch {
      copied = false;
    }
    setInsertError(copied ? `${res.reason} The text is copied, so you can paste it yourself.` : res.reason);
    setInserting(false);
  }

  const activeTranslation = view.kind === 'done' ? view.translation : null;
  const variants = activeTranslation?.data.variants ?? [];
  const activeVariant = variants.find((v) => v.style === selectedStyle) ?? variants[0] ?? null;

  // Only worth a line when the text came from the page. No generic tips: the box and the footer already say it.
  const hint: ReactNode =
    field && !field.info.guessed && field.info.text.trim() ? (
      <p className="truncate text-[11.5px] text-muted">From the box on {field.info.site}</p>
    ) : null;

  return (
    <div className="min-w-0 space-y-3">
      {(hint || (credits && credits.limit !== null)) && (
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0 flex-1">{hint}</div>
          <CreditsLine credits={credits} />
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
        <div className="min-w-0 space-y-1">
          <label htmlFor={`${uid}-from`} className="block text-[11px] font-semibold uppercase tracking-wide text-subtle">
            From
          </label>
          <LanguageSelect
            id={`${uid}-from`}
            label="Translate from"
            value={source}
            onChange={setSource}
            includeAuto
            favorites={favorites}
            className="h-8 w-full text-[12px]"
          />
        </div>
        <button
          type="button"
          onClick={swapLanguages}
          disabled={!swapFrom}
          aria-label="Swap languages"
          title={swapFrom ? 'Swap languages' : 'Translate once so Verba knows the source language'}
          className="mb-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:pointer-events-none disabled:opacity-40"
        >
          <ArrowLeftRight size={15} aria-hidden />
        </button>
        <div className="min-w-0 space-y-1">
          <label htmlFor={`${uid}-to`} className="block text-[11px] font-semibold uppercase tracking-wide text-subtle">
            To
          </label>
          <LanguageSelect
            id={`${uid}-to`}
            label="Translate to"
            value={target}
            onChange={setTarget}
            favorites={favorites}
            className="h-8 w-full text-[12px]"
          />
        </div>
      </div>

      <div>
        <textarea
          aria-label="Text to translate"
          value={text}
          placeholder="Type or paste text to translate…"
          rows={4}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              translate();
            }
          }}
          className={cn(fieldClass, 'resize-none leading-5', tooLong && 'border-danger/60')}
        />
        {(text.length > 0 || view.kind !== 'idle') && (
          <div className="mt-1 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <Eraser size={12} aria-hidden /> Clear
            </button>
            <span className={cn('text-[10.5px] tabular-nums', tooLong ? 'text-danger' : 'text-subtle')}>
              {text.length.toLocaleString()} / {MAX_INPUT_CHARS.toLocaleString()}
            </span>
          </div>
        )}
      </div>
      {tooLong && (
        <p className="text-[11.5px] text-danger">
          Text is too long to translate. Keep it under {MAX_INPUT_CHARS.toLocaleString()} characters.
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-[11px] text-subtle" aria-hidden>
          <Kbd>Ctrl</Kbd>
          <Kbd>Enter</Kbd>
        </span>
        <div className="flex items-center gap-2">
          <MicButton speech={speech} getBase={() => text} disabled={view.kind === 'loading'} />
          <Button icon={Languages} loading={view.kind === 'loading'} disabled={!canTranslate} onClick={translate}>
            Translate
          </Button>
        </div>
      </div>
      <SpeechNotice speech={speech} />

      <div aria-live="polite" className="min-w-0 space-y-3">
        {view.kind === 'loading' && (
          <div className="space-y-2">
            <span className="sr-only">Translating</span>
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {view.kind === 'error' && view.error.code === 'NO_PROVIDER_CONFIGURED' && (
          <div role="alert" className="flex gap-2.5 rounded-xl border border-danger/20 bg-danger-soft p-3 text-fg animate-fade-in">
            <KeyRound size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden />
            <div className="min-w-0 flex-1 text-[12.5px]">
              <p className="font-medium">Translation isn't set up on this server yet.</p>
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
          <ErrorMessage error={view.error} onRetry={translate} compact />
        )}

        {activeTranslation && activeVariant && (
          <section aria-label="Translations" className="animate-slide-up min-w-0 space-y-3">
            <div className="min-w-0 space-y-1.5">
              <div className="flex min-h-5 items-center justify-between gap-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-subtle">What it means</h3>
                {activeTranslation.data.detectedSourceLang && (
                  <Badge tone="brand" className="min-w-0 truncate">
                    {languageName(activeTranslation.data.detectedSourceLang)}
                    {activeTranslation.data.romanized ? ' · romanized' : ''}
                  </Badge>
                )}
              </div>
              <p className="break-words text-[12.5px] leading-5 text-muted">{activeTranslation.data.meaning}</p>
            </div>

            <VariantTabs
              variants={variants}
              activeStyle={activeVariant.style}
              onSelect={setSelectedStyle}
              idPrefix={`${uid}-variants`}
              lang={activeTranslation.targetLang}
            />

            <div className="flex flex-wrap items-center justify-end gap-2">
              <CopyButton text={activeVariant.text} />
              {field && (
                <Button
                  icon={CornerDownLeft}
                  loading={inserting}
                  disabled={inserting}
                  onClick={() => void insert(activeVariant.text)}
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
