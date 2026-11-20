import {
  REPLY_INTENT_MAX_LENGTH,
  REPLY_MESSAGE_MAX_LENGTH,
  type CreditStatus,
  type ReplyVariantsRequest,
  type ReplyVariantsResponse,
  type UserSettings,
} from '@verba/shared';
import { CornerDownLeft, ExternalLink, KeyRound, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { localError } from '../../components/errors';
import { LanguageSelect } from '../../components/LanguageSelect';
import { openDashboard } from '../../components/navigation';
import { Button } from '../../components/ui/Button';
import { CopyButton } from '../../components/ui/CopyButton';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { fieldClass } from '../../components/ui/fieldClass';
import { cn } from '../../components/ui/cn';
import { Skeleton } from '../../components/ui/Spinner';
import { callApi, type ExtensionError } from '../../shared/messages';
import { CreditLimitNotice, CreditsLine, readResetsAt } from '../translator/CreditsLine';
import { useCredits } from '../translator/useCredits';
import { VariantTabs } from '../translator/VariantTabs';
import { useFieldInsert } from '../shared/useFieldInsert';

const DEFAULT_LANG = 'en';
const NO_FAVORITES: readonly string[] = [];

interface Replies {
  /** The language the request used. Results are labelled with this, not with the current select value. */
  targetLang: string;
  data: ReplyVariantsResponse;
}

type View =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; error: ExtensionError; credits?: CreditStatus | null }
  | { kind: 'done'; replies: Replies };

export interface ReplyPanelProps {
  /** The received message (the text selected on the page). */
  message: string;
  settings: UserSettings | null;
  /** Replies are only put into the page while the panel is showing. */
  open?: boolean;
}

/** Drafts replies to a received message in several tones, and inserts the chosen one into the page's text box. */
export function ReplyPanel({ message, settings, open = true }: ReplyPanelProps) {
  const favorites = settings?.favoriteLanguages ?? NO_FAVORITES;
  const uid = useId();
  const intentId = `${uid}-intent`;
  const langId = `${uid}-lang`;

  const [intent, setIntent] = useState('');
  const [lang, setLang] = useState(DEFAULT_LANG);
  const [selectedStyle, setSelectedStyle] = useState('');
  const [view, setView] = useState<View>({ kind: 'idle' });
  const [dashboardFailed, setDashboardFailed] = useState(false);
  const { field, inserting, insertError, insert, insertQuietly, clearInsertError } = useFieldInsert();
  /** What the last successful request used ("intent|language"). "New replies" stays off until this changes. */
  const [ranKey, setRanKey] = useState('');
  /** The reply Verba last tried to put in the page's box, so the same one is not inserted twice. */
  const lastAuto = useRef<string | null>(null);
  /** True once Verba itself put a reply in the box, so a later tone may replace it. */
  const ownsBox = useRef(false);
  const [autoAdded, setAutoAdded] = useState(false);
  const { credits, refresh: refreshCredits } = useCredits();

  /** Long selections: only the most recent part is sent. */
  const truncated = message.length > REPLY_MESSAGE_MAX_LENGTH;
  const sent = truncated ? message.slice(-REPLY_MESSAGE_MAX_LENGTH).trim() : message.trim();

  /** Latest request id. Responses to older requests are ignored. */
  const requestSeq = useRef(0);
  const autoRan = useRef(false);

  const trimmedIntent = intent.trim();
  const currentKey = `${trimmedIntent}|${lang}`;
  // Asking again with the same words and language would only spend another credit for the same replies.
  const canRegenerate = view.kind !== 'loading' && sent.length > 0 && !(view.kind === 'done' && currentKey === ranKey);

  const run = useCallback(
    async (intentText: string | undefined, targetLang: string) => {
      const seq = ++requestSeq.current;
      setView({ kind: 'loading' });
      clearInsertError();
      const request: ReplyVariantsRequest = { message: sent, targetLang };
      if (intentText) request.intent = intentText;
      const res = await callApi<ReplyVariantsResponse>('POST', '/reply-variants', request);
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
        setView({ kind: 'error', error: localError('No replies came back. Try again.') });
        return;
      }
      setRanKey(`${intentText ?? ''}|${targetLang}`);
      setView({ kind: 'done', replies: { targetLang, data: res.data } });
    },
    [sent, refreshCredits, clearInsertError],
  );

  // The first set of replies is requested on mount, once (StrictMode mounts twice in development).
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    void run(undefined, DEFAULT_LANG);
  }, [run]);

  function regenerate() {
    if (!canRegenerate) return;
    void run(trimmedIntent || undefined, lang);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    regenerate();
  }

  async function openProviders() {
    const res = await openDashboard('/settings/providers');
    setDashboardFailed(!res.ok);
  }

  const replies = view.kind === 'done' ? view.replies : null;
  const variants = replies?.data.variants ?? [];
  const activeVariant = variants.find((v) => v.style === selectedStyle) ?? variants[0] ?? null;
  const activeText = activeVariant?.text ?? null;

  // The reply goes straight into the page's message box. The Insert button stays for when the user wants to
  // close Verba too. Picking another tone swaps the text. A box the user already typed in is never overwritten.
  useEffect(() => {
    if (!open || view.kind !== 'done' || !field || activeText === null) return;
    if (lastAuto.current === activeText) return;
    if (!ownsBox.current && field.info.text.trim() !== '') return;
    lastAuto.current = activeText;
    void insertQuietly(activeText).then((ok) => {
      if (ok) {
        ownsBox.current = true;
        setAutoAdded(true);
      }
    });
  }, [open, view.kind, field, activeText, insertQuietly]);

  return (
    <div className="min-w-0 space-y-2.5">
      <div className="flex min-h-4 items-center justify-between gap-2">
        {truncated ? (
          <p className="min-w-0 flex-1 text-[11px] text-subtle">
            Long message: replies use its last {REPLY_MESSAGE_MAX_LENGTH.toLocaleString()} characters.
          </p>
        ) : (
          <span className="min-w-0 flex-1" />
        )}
        <CreditsLine credits={credits} />
      </div>

      <div aria-live="polite" className="min-w-0 space-y-2.5">
        {view.kind === 'loading' && (
          <div className="space-y-2">
            <span className="sr-only">Writing replies</span>
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}

        {view.kind === 'error' && view.error.code === 'NO_PROVIDER_CONFIGURED' && (
          <div role="alert" className="flex gap-2.5 rounded-xl border border-danger/20 bg-danger-soft p-3 text-fg animate-fade-in">
            <KeyRound size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden />
            <div className="min-w-0 flex-1 text-[12.5px]">
              <p className="font-medium">Replies aren't set up on this server yet.</p>
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
          <ErrorMessage error={view.error} onRetry={regenerate} compact />
        )}

        {replies && activeVariant && (
          <section aria-label="Reply drafts" className="animate-slide-up min-w-0 space-y-2.5">
            <VariantTabs
              variants={variants}
              activeStyle={activeVariant.style}
              onSelect={setSelectedStyle}
              idPrefix={`${uid}-variants`}
              lang={replies.targetLang}
            />

            {autoAdded && (
              <p className="text-[11.5px] text-success">Added to the message box. Pick another tone to swap it.</p>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
              {/* The reply is already in the box; this inserts it again and closes Verba. Copy only when there is no box. */}
              {field ? (
                <Button
                  fullWidth
                  icon={CornerDownLeft}
                  loading={inserting}
                  disabled={inserting}
                  onClick={() => void insert(activeVariant.text)}
                >
                  Insert and close
                </Button>
              ) : (
                <CopyButton text={activeVariant.text} />
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

      <form onSubmit={onSubmit} className="min-w-0 space-y-2">
        <div className="space-y-1">
          <label htmlFor={intentId} className="block text-[12px] font-medium text-fg">
            What do you want to say? <span className="font-normal text-subtle">(optional)</span>
          </label>
          <input
            id={intentId}
            type="text"
            value={intent}
            maxLength={REPLY_INTENT_MAX_LENGTH}
            placeholder="e.g. yes, I'll be there in 5 minutes"
            onChange={(e) => setIntent(e.target.value)}
            className={cn(fieldClass, 'h-8 py-1 text-[12.5px]')}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <label htmlFor={langId} className="shrink-0 text-[12px] text-muted">
              Reply in
            </label>
            <LanguageSelect
              id={langId}
              label="Reply in"
              value={lang}
              onChange={setLang}
              favorites={favorites}
              className="max-w-[10rem]"
            />
          </div>
          <Button
            type="submit"
            variant="outline"
            size="sm"
            icon={RefreshCw}
            loading={view.kind === 'loading'}
            disabled={!canRegenerate}
          >
            New replies
          </Button>
        </div>
      </form>
    </div>
  );
}
