import type { UserSettings } from '@verba/shared';
import { Lightbulb, MessageSquareReply } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Button } from '../components/ui/Button';
import { PENDING_EXPLAIN_KEY, cleanSelection, type PendingExplain } from '../shared/explain';
import { readPageSelection, type PageSelection } from './translator/pageBridgeClient';
import { ReplyPanel } from './reply/ReplyPanel';
import { useGuest } from './shared/guest';

const PREVIEW_CHARS = 140;

export interface ExplainSelectionCardProps {
  /** Passed to the reply panel for its favourite languages. */
  settings?: UserSettings | null;
}

/**
 * Shown at the top of the popup when text is highlighted on the page: one click opens the side
 * panel with a simple explanation, or drafts replies to it. Renders nothing when there is no
 * selection (or the page cannot be read, e.g. Chrome's PDF viewer, where the right-click menu still works).
 */
export function ExplainSelectionCard({ settings = null }: ExplainSelectionCardProps) {
  const [selection, setSelection] = useState<PageSelection | null>(null);
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
    return () => {
      alive = false;
    };
  }, []);

  if (!selection) return null;
  const text = cleanSelection(selection.info.text);
  if (!text) return null;
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
      aria-label="Explain selected text"
      className="min-w-0 space-y-4 rounded-2xl border border-brand/30 bg-brand-soft p-4 animate-fade-in"
    >
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">You selected</p>
        <p className="line-clamp-3 break-words rounded-xl bg-surface/70 px-3 py-2.5 text-[13px] leading-5 text-fg">
          {preview}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Button
          icon={Lightbulb}
          fullWidth
          // Explain needs an account; for a visitor the button leads to sign-in instead of failing.
          onClick={() => (guest.isGuest ? guest.openAuth('signin') : explain(selection.tabId, text, selection.info.site))}
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
          <ReplyPanel message={text} settings={settings} open={replyOpen} />
        </div>
      )}
    </section>
  );
}
