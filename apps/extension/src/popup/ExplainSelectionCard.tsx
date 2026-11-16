import { Lightbulb } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../components/ui/Button';
import { PENDING_EXPLAIN_KEY, cleanSelection, type PendingExplain } from '../shared/explain';
import { readPageSelection, type PageSelection } from './translator/pageBridgeClient';

const PREVIEW_CHARS = 140;

/**
 * Shown at the top of the popup when text is highlighted on the page: one click opens the side
 * panel with a simple explanation. Renders nothing when there is no selection (or the page cannot
 * be read, e.g. Chrome's PDF viewer, where the right-click menu still works).
 */
export function ExplainSelectionCard() {
  const [selection, setSelection] = useState<PageSelection | null>(null);
  const [failed, setFailed] = useState(false);

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
      className="min-w-0 space-y-2 rounded-xl border border-brand/30 bg-brand-soft p-3 animate-fade-in"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">You selected</p>
      <p className="line-clamp-3 break-words text-[12.5px] leading-5 text-fg">{preview}</p>
      <Button
        size="sm"
        icon={Lightbulb}
        fullWidth
        onClick={() => explain(selection.tabId, text, selection.info.site)}
      >
        Explain this simply
      </Button>
      {failed && <p className="text-[12px] text-danger">Could not open the side panel. Try right-click → Explain with Verba.</p>}
    </section>
  );
}
