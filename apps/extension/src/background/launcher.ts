import { fail, ok } from '../lib/result';
import type { Result } from '../shared/messages';
import { PENDING_REPLY_KEY, type PendingReply } from '../shared/explain';

/** Opens the toolbar popup in the window of the tab that asked (the in-page Verba button). Needs Chrome 127+. */
export async function openPopup(sender: chrome.runtime.MessageSender, replyTo?: string): Promise<Result<null>> {
  const windowId = sender.tab?.windowId;
  // Only the top frame of a real tab may ask; a service worker has no "current window" of its own.
  if (windowId === undefined || (sender.frameId ?? 0) !== 0) {
    return fail('FORBIDDEN_PATH', 'This request is not allowed from this page.');
  }
  // openPopup must run straight after the click: Chrome refuses it once the click is too far back, so nothing
  // is awaited before it. The email is written at the same moment; the popup waits briefly for it.
  // Cleared when there is none, so an old email is never answered by mistake.
  const tabId = sender.tab?.id;
  const pending: PendingReply | null =
    replyTo && typeof tabId === 'number' ? { text: replyTo, tabId, requestedAt: Date.now() } : null;
  const handOver = (pending
    ? chrome.storage.session.set({ [PENDING_REPLY_KEY]: pending })
    : chrome.storage.session.remove(PENDING_REPLY_KEY)
  ).catch(() => undefined);
  try {
    await chrome.action.openPopup({ windowId });
  } catch {
    await handOver;
    return fail('INTERNAL', 'Click the Verba icon in the toolbar (or press Alt+Shift+V) to open Verba.');
  }
  await handOver;
  return ok(null);
}
