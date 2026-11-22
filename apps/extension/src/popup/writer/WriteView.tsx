import {
  WRITE_IMAGE_MAX_COUNT,
  WRITE_PROMPT_MAX_LENGTH,
  type CreditStatus,
  type UserSettings,
  type WriteRequest,
  type WriteResponse,
} from '@verba/shared';
import { CornerDownLeft, Eraser, ExternalLink, KeyRound, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type ClipboardEvent } from 'react';
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
import { MicButton, SpeechNotice } from '../shared/MicButton';
import { imagesFromClipboard, prepareImage, type AttachedImage } from '../shared/imageAttach';
import { useSpeechInput } from '../shared/speech';
import { useFieldInsert } from '../shared/useFieldInsert';
import { WRITE_TEMPLATES, type WriteTemplate } from './templates';

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
  /** False while another tab is showing: the microphone must not keep typing into a box nobody can see. */
  active?: boolean;
}

/** Ask anything: answers questions or writes content (a letter, an application, a message), and can insert it into the page. */
export function WriteView({ settings, active = true }: WriteViewProps) {
  const favorites = settings?.favoriteLanguages ?? NO_FAVORITES;
  const uid = useId();
  const promptId = `${uid}-prompt`;

  const [prompt, setPrompt] = useState('');
  /** Screenshots pasted with Ctrl+V. The AI reads them together with the question. */
  const [images, setImages] = useState<AttachedImage[]>([]);
  const [attachNote, setAttachNote] = useState<string | null>(null);
  // Write always starts in English, whatever the translator's target language is.
  const [lang, setLang] = useState(DEFAULT_LANG);
  const { field, inserting, insertError, insert, clearInsertError } = useFieldInsert();
  const [view, setView] = useState<View>({ kind: 'idle' });
  const [dashboardFailed, setDashboardFailed] = useState(false);
  /** What the last successful answer used ("question|language"). Ask stays off until one of them changes. */
  const [ranKey, setRanKey] = useState('');
  // Spoken Hindi, English or Hinglish is all written in Latin letters by the English (India) recognizer.
  const speech = useSpeechInput('en', setPrompt);
  const { credits, refresh: refreshCredits } = useCredits();

  const stopSpeech = speech.abort;
  useEffect(() => {
    if (!active) stopSpeech();
  }, [active, stopSpeech]);

  /** Latest request id. Responses to older requests are ignored. */
  const requestSeq = useRef(0);

  const trimmed = prompt.trim();
  const tooLong = prompt.length > WRITE_PROMPT_MAX_LENGTH;
  const currentKey = `${trimmed}|${lang}|${images.map((entry) => entry.id).join(',')}`;
  // Asking the same thing again would only spend another credit for the same answer.
  const canWrite = (trimmed.length > 0 || images.length > 0) && !tooLong && view.kind !== 'loading' && !(view.kind === 'done' && currentKey === ranKey);

  const run = useCallback(
    async (request: WriteRequest, ranFor: string) => {
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
      setRanKey(ranFor);
      setView({ kind: 'done', written: { request, text } });
    },
    [refreshCredits, clearInsertError],
  );

  /** Starts fresh: empties the box, drops the answer and ignores any request still in flight. */
  function clearAll() {
    speech.abort();
    requestSeq.current++;
    setPrompt('');
    setImages([]);
    setAttachNote(null);
    setView({ kind: 'idle' });
    setRanKey('');
    clearInsertError();
  }

  /** Fills the box with a starter prompt for the user to edit. Does not submit. */
  function applyTemplate(template: WriteTemplate) {
    speech.abort();
    setPrompt(template.prompt);
    requestAnimationFrame(() => {
      const box = document.getElementById(promptId) as HTMLTextAreaElement | null;
      if (!box) return;
      box.focus();
      box.setSelectionRange(box.value.length, box.value.length);
    });
  }

  function submit() {
    if (!canWrite) return;
    speech.abort();
    const request: WriteRequest = { prompt: trimmed, targetLang: lang };
    if (images.length > 0) request.images = images.map((entry) => entry.image);
    void run(request, currentKey);
  }

  async function onPaste(event: ClipboardEvent<HTMLDivElement>) {
    const files = imagesFromClipboard(event.clipboardData);
    if (files.length === 0) return;
    // A pasted picture is not text: keep it out of the box.
    event.preventDefault();
    setAttachNote(null);
    const room = WRITE_IMAGE_MAX_COUNT - images.length;
    if (room <= 0) {
      setAttachNote(`You can add up to ${WRITE_IMAGE_MAX_COUNT} pictures.`);
      return;
    }
    const take = files.slice(0, room);
    const prepared = await Promise.all(take.map((file) => prepareImage(file)));
    const ok = prepared.filter((entry): entry is AttachedImage => entry !== null);
    if (ok.length < take.length) setAttachNote('That picture could not be read or is too large.');
    else if (files.length > room) setAttachNote(`Only ${WRITE_IMAGE_MAX_COUNT} pictures fit. The rest were left out.`);
    if (ok.length > 0) setImages((prev) => [...prev, ...ok].slice(0, WRITE_IMAGE_MAX_COUNT));
  }

  async function openProviders() {
    const res = await openDashboard('/settings/providers');
    setDashboardFailed(!res.ok);
  }

  const done = view.kind === 'done' ? view.written : null;

  return (
    <div className="min-w-0 space-y-3" onPaste={(e) => void onPaste(e)}>
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
          placeholder="Ask a question, or tell Verba what to write. You can also paste a screenshot (Ctrl+V)."
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          className={cn(fieldClass, 'resize-none leading-5', tooLong && 'border-danger/60')}
        />
                {images.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2" aria-label="Attached pictures">
            {images.map((entry, index) => (
              <li key={entry.id} className="relative">
                <img
                  src={entry.preview}
                  alt={`Attached picture ${index + 1}`}
                  className="h-14 w-14 rounded-lg border border-border object-cover"
                />
                <button
                  type="button"
                  aria-label={`Remove picture ${index + 1}`}
                  onClick={() => setImages((prev) => prev.filter((other) => other.id !== entry.id))}
                  className="absolute -right-1.5 -top-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-fg text-bg shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                >
                  <X size={10} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        {attachNote && <p className="mt-1 text-[11.5px] text-danger">{attachNote}</p>}
        {(prompt.length > 0 || images.length > 0 || view.kind !== 'idle') && (
          <div className="mt-1 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <Eraser size={12} aria-hidden /> Clear
            </button>
            <span className={cn('text-[10.5px] tabular-nums', tooLong ? 'text-danger' : 'text-subtle')}>
              {prompt.length.toLocaleString()} / {WRITE_PROMPT_MAX_LENGTH.toLocaleString()}
            </span>
          </div>
        )}
      </div>

      {prompt.trim() === '' && images.length === 0 && view.kind === 'idle' && (
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-subtle">Try one of these</p>
          <div role="group" aria-label="Quick start templates" className="mt-1.5 flex flex-wrap gap-1.5">
            {WRITE_TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => applyTemplate(template)}
                className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11.5px] font-medium text-muted hover:border-border-strong hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                {template.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <LanguageSelect label="Answer in" value={lang} onChange={setLang} favorites={favorites} className="w-full" />

      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-[11px] text-subtle" aria-hidden>
          <Kbd>Ctrl</Kbd>
          <Kbd>Enter</Kbd>
        </span>
        <div className="flex items-center gap-2">
          <MicButton speech={speech} getBase={() => prompt} disabled={view.kind === 'loading'} />
          <Button icon={Sparkles} loading={view.kind === 'loading'} disabled={!canWrite} onClick={submit}>
            Ask
          </Button>
        </div>
      </div>
      <SpeechNotice speech={speech} />

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
