/**
 * "Explain with Verba" context menu. Clicking it opens the side panel and hands the
 * selected text to the panel through chrome.storage.session (see src/shared/explain.ts).
 *
 * Privacy: the selected text is never logged. Only short error messages are logged.
 */
import {
  EXPLAIN_MENU_ID,
  PENDING_EXPLAIN_KEY,
  cleanSelection,
  type PendingExplain,
} from '../shared/explain';

/** Reads chrome.runtime.lastError so Chrome does not warn about an unchecked error. */
function logLastError(context: string): void {
  const error = chrome.runtime.lastError;
  if (error) console.warn(`Verba ${context}: ${error.message ?? 'unknown error'}`);
}

/** Hostname of the page the selection came from, or '' when unknown (e.g. file:// URLs). */
function siteOf(info: chrome.contextMenus.OnClickData): string {
  const url = info.pageUrl ?? info.frameUrl;
  if (!url) return '';
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/** Creates the menu item. removeAll first so reloads never leave a duplicate id behind. */
export function registerExplainMenu(): void {
  chrome.contextMenus.removeAll(() => {
    logLastError('removeAll context menus failed');
    chrome.contextMenus.create(
      { id: EXPLAIN_MENU_ID, title: 'Explain with Verba', contexts: ['selection'] },
      () => logLastError('create context menu failed'),
    );
  });
}

/**
 * Context menu click handler. Nothing here awaits: chrome.sidePanel.open must run synchronously
 * inside the user gesture. The selection write is issued first so a panel that opens fresh reads
 * the new text on mount instead of explaining the previous selection.
 */
export function handleExplainClick(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab): void {
  if (info.menuItemId !== EXPLAIN_MENU_ID) return;

  const text = cleanSelection(info.selectionText);
  if (text !== null) {
    const pending: PendingExplain = { text, site: siteOf(info), requestedAt: Date.now() };
    chrome.storage.session.set({ [PENDING_EXPLAIN_KEY]: pending }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'unknown error';
      console.warn(`Verba could not save the selection: ${message}`);
    });
  }

  const target = tab?.id !== undefined
    ? { tabId: tab.id }
    : { windowId: tab?.windowId ?? chrome.windows.WINDOW_ID_CURRENT };
  chrome.sidePanel.open(target).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.warn(`Verba could not open the side panel: ${message}`);
  });
}
