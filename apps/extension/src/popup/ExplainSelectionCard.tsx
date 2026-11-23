import type { UserSettings } from '@verba/shared';
import { Lightbulb, MessageSquareReply } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Button } from '../components/ui/Button';
import {
  PENDING_EXPLAIN_KEY,
  PENDING_REPLY_KEY,
  PENDING_REPLY_MAX_AGE_MS,
  cleanSelection,
  isPendingReply,
  type PendingExplain,
} from '../shared/explain';
import { readPageSelection, type PageSelection } from './translator/pageBridgeClient';
import { ReplyPanel } from './reply/ReplyPanel';
import { useGuest } from './shared/guest';

const PREVIEW_CHARS = 140;
/** How often, and how far apart, the popup looks for an email the in-page button is still handing over. */
const PENDING_REPLY_READS = 4;
const PENDING_REPLY_RETRY_MS = 120;

export interface ExplainSelectionCardProps {
  /** Passed to the reply panel for its favourite languages. */
  settings?: UserSettings | null;
}

/** The email to answer, handed over by the in-page Verba button of a webmail thread. */
interface MailToAnswer {
  text: string;
  tabId: number;
  site: string;
}

/**
 * The email the in-page button handed over, if it is fresh and for this tab. Used once: it is removed after
 * reading, so reopening the popup later does not draft (and pay for) the same replies again.
 */
async function takePendingReply(): Promise<MailToAnswer | null> {
  try {
    // The background writes the email while the popup is opening, so it can land a moment after we start.
    let raw: unknown;
    for (let attempt = 0; attempt < PENDING_REPLY_READS; attempt++) {
      raw = (await chrome.storage.session.get(PENDING_REPLY_KEY))[PENDING_REPLY_KEY];
      if (isPendingReply(raw)) break;
      await new Promise((resolve) => setTimeout(resolve, PENDING_REPLY_RETRY_MS));
    }
    if (!isPendingReply(raw) || Date.now() - raw.requestedAt > PENDING_REPLY_MAX_AGE_MS) return null;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id !== raw.tabId) return null;
    await chrome.storage.session.remove(PENDING_REPLY_KEY);
    let site = '';
    try {
      site = tab.url ? new URL(tab.url).hostname : '';
    } catch {
      site = '';
    }
    return { text: raw.text, tabId: raw.tabId, site };
  } catch {
    return null;
  }
}

/**
 * Shown at the top of the popup when text is highlighted on the page: one click opens the side
 * panel with a simple explanation, or drafts replies to it. When the popup was opened from the Verba
 * button in a webmail thread, it shows the last email instead and starts drafting replies straight away.
 * Renders nothing when there is neither (or the page cannot be read, e.g. Chrome's PDF viewer).
 */
export function ExplainSelectionCard({ settings = null }: ExplainSelectionCardProps) {
  const [selection, setSelection] = useState<PageSelection | null>(null);
  const [mail, setMail] = useState<MailToAnswer | null>(null);
  const [failed, setFailed] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  /** Set on the first open and kept mounted after that, so toggling does not request (and spend) new replies. */
  const [replyMounted, setReplyMounted] = useState(false);
  const replyId = useId();
  const guest = useGuest();

  useEffect(() => {
    let alive = true;
    void readPageSelection().then((found) => {
      if (alive) setSelection(found);
    });
    void takePendingReply().then((found) => {
      if (!alive || !found) return;
      // The user clicked the Verba button in the thread to reply: open the replies right away.
      setMail(found);
      setReplyMounted(true);
      setReplyOpen(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Text highlighted in the message box is the user's own: there is nothing to explain or reply to.
  const highlighted = selection && !selection.info.inEditable ? cleanSelection(selection.info.text) : null;
  const source = mail
    ? { text: mail.text, tabId: mail.tabId, site: mail.site }
    : highlighted && selection
      ? { text: highlighted, tabId: selection.tabId, site: selection.info.site }
      : null;
  if (!source) return null;
  const { text } = source;
  const preview = text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS).trimEnd()}…` : text;

  // No await before sidePanel.open: it must run inside the click's user gesture. The selection is
  // written first so the panel reads the new text when it mounts.
  function explain(tabId: number, pendingText: string, site: string) {
    setFailed(false);
    const pending: PendingExplain = { text: pendingText, site, requestedAt: Date.now() };
    chrome.storage.session.set({ [PENDING_EXPLAIN_KEY]: pending }).catch(() => setFailed(true));
    chrome.sidePanel
      .open({ tabId })
      .then(() => window.close())
      .catch(() => setFailed(true));
  }

  return (
    <section
      aria-label={mail ? 'Reply to the last email' : 'Explain selected text'}
      className="min-w-0 space-y-4 rounded-2xl border border-brand/30 bg-brand-soft p-4 animate-fade-in"
    >
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
          {mail ? 'Replying to the last email' : 'You selected'}
        </p>
        <p className="line-clamp-3 break-words rounded-xl bg-surface/70 px-3 py-2.5 text-[13px] leading-5 text-fg">
          {preview}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Button
          icon={Lightbulb}
          fullWidth
          // Explain needs an account; for a visitor the button leads to sign-in instead of failing.
          onClick={() => (guest.isGuest ? guest.openAuth('signin') : explain(source.tabId, text, source.site))}
        >
          Explain
        </Button>
        <Button
          variant="outline"
          icon={MessageSquareReply}
          fullWidth
          aria-expanded={replyOpen}
          aria-controls={replyId}
          onClick={() => {
            setReplyMounted(true);
            setReplyOpen((open) => !open);
          }}
        >
          Reply to this
        </Button>
      </div>
      {failed && <p className="text-[12px] text-danger">Could not open the side panel. Try right-click → Explain with Verba.</p>}
      {replyMounted && (
        <div id={replyId} hidden={!replyOpen} className="min-w-0 rounded-xl bg-surface p-4 shadow-card">
          <ReplyPanel message={text} settings={settings} open={replyOpen} closeAfterInsert={mail !== null} />
        </div>
      )}
    </section>
  );
}
