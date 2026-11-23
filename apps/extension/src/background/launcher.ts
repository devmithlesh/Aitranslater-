import { fail, ok } from '../lib/result';
import type { Result } from '../shared/messages';

/** Opens the toolbar popup in the window of the tab that asked (the in-page Verba button). Needs Chrome 127+. */
export async function openPopup(sender: chrome.runtime.MessageSender): Promise<Result<null>> {
  const windowId = sender.tab?.windowId;
  // Only the top frame of a real tab may ask; a service worker has no "current window" of its own.
  if (windowId === undefined || (sender.frameId ?? 0) !== 0) {
    return fail('FORBIDDEN_PATH', 'This request is not allowed from this page.');
  }
  try {
    await chrome.action.openPopup({ windowId });
    return ok(null);
  } catch {
    return fail('INTERNAL', 'Click the Verba icon in the toolbar (or press Alt+Shift+V) to open Verba.');
  }
}
