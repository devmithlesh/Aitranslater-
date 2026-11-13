/**
 * Popup-side client for the page bridge installed by the content script.
 *
 * The bridge lives on `globalThis[PAGE_BRIDGE_KEY]` in the extension's isolated world.
 * `chrome.scripting.executeScript` runs our `func` in that same world, so the bridge is reachable.
 * Every function passed as `func` is serialized by Chrome: it must not use imports or outer
 * variables. Everything it needs goes through `args`.
 */
import { PAGE_BRIDGE_KEY, type FocusedFieldInfo, type InsertResult } from '../../shared/page-bridge';

export interface FocusedField {
  info: FocusedFieldInfo;
  tabId: number;
  frameId: number;
}

const INSERT_FAILED_REASON = 'Could not reach the page. Reload the tab and try again.';

/** Pages where content scripts and scripting cannot run. */
const RESTRICTED_PROTOCOLS = ['chrome:', 'edge:', 'chrome-extension:', 'about:', 'devtools:'];

function isRestrictedUrl(url: string | undefined): boolean {
  // Without the "tabs" permission Chrome may omit the URL. Treat that as unknown and let
  // executeScript decide. It fails on restricted pages and the catch below handles it.
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }
  if (RESTRICTED_PROTOCOLS.includes(parsed.protocol)) return true;
  if (parsed.hostname === 'chromewebstore.google.com') return true;
  if (parsed.hostname === 'chrome.google.com' && parsed.pathname.startsWith('/webstore')) return true;
  return false;
}

function isFieldInfo(value: unknown): value is FocusedFieldInfo {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.text === 'string' &&
    typeof v.focusedAt === 'number' &&
    Number.isFinite(v.focusedAt) &&
    (v.kind === 'input' || v.kind === 'contenteditable') &&
    typeof v.site === 'string'
  );
}

function isInsertResult(value: unknown): value is InsertResult {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.ok === true) return true;
  return v.ok === false && typeof v.reason === 'string';
}

/** Returned by the injected reader when a frame has no bridge (content script not running there). */
const MISSING_BRIDGE = 'verba:missing-bridge';

type FrameResult = { frameId: number; result?: unknown };

/** Asks every frame's bridge for its focused field. `func` is serialized: everything comes through args. */
async function readAllFrames(tabId: number): Promise<FrameResult[]> {
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: (key: string, missing: string) => {
      const bridge = (globalThis as Record<string, unknown>)[key] as { readFocused?: () => unknown } | undefined;
      if (!bridge || typeof bridge.readFocused !== 'function') return missing;
      return bridge.readFocused() ?? null;
    },
    args: [PAGE_BRIDGE_KEY, MISSING_BRIDGE],
  });
  return results as FrameResult[];
}

function pickNewest(results: readonly FrameResult[], tabId: number): FocusedField | null {
  let best: FocusedField | null = null;
  for (const entry of results) {
    const info = entry.result;
    if (!isFieldInfo(info)) continue;
    if (best === null || info.focusedAt > best.info.focusedAt) {
      best = { info, tabId, frameId: entry.frameId };
    }
  }
  return best;
}

/**
 * Finds the most recently focused editable field across all frames of the active tab.
 * Tabs opened before Verba was installed (or reloaded) have no content script; then the script is
 * injected on the spot (activeTab grants access) and the read is retried, so no page reload is needed.
 * Returns null when there is no such field or the page cannot be scripted.
 */
export async function readFocusedField(): Promise<FocusedField | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || typeof tab.id !== 'number' || isRestrictedUrl(tab.url)) return null;
    const tabId = tab.id;

    let results = await readAllFrames(tabId);
    if (results.length > 0 && results.every((entry) => entry.result === MISSING_BRIDGE)) {
      // content.js guards against running twice, so injecting into frames that already have it is harmless.
      await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['content.js'] });
      results = await readAllFrames(tabId);
    }
    return pickNewest(results, tabId);
  } catch {
    // No "scripting" permission or no access to this page.
    return null;
  }
}

/** Replaces the whole text of the field in one frame. Never claims success it did not get from the bridge. */
export async function insertIntoField(tabId: number, frameId: number, text: string): Promise<InsertResult> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      func: async (key: string, value: string) => {
        const bridge = (globalThis as Record<string, unknown>)[key] as
          | { insert?: (text: string) => Promise<unknown> }
          | undefined;
        if (!bridge || typeof bridge.insert !== 'function') {
          return { ok: false, reason: 'missing-bridge' };
        }
        return await bridge.insert(value);
      },
      args: [PAGE_BRIDGE_KEY, text],
    });
    const result = (results as ReadonlyArray<{ result?: unknown }>)[0]?.result;
    if (isInsertResult(result)) {
      if (result.ok) return { ok: true };
      // The bridge reports a specific reason (for example, the field changed). Show that, not a generic one.
      if (result.reason !== 'missing-bridge') return { ok: false, reason: result.reason };
    }
  } catch {
    // Frame gone, page navigated, or no permission. Fall through to the generic reason.
  }
  return { ok: false, reason: INSERT_FAILED_REASON };
}
