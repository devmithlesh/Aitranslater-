/**
 * Contract between the background worker and the side panel for "Explain with Verba".
 *
 *   right-click selected text ──► background (context menu click)
 *       ├─ chrome.sidePanel.open({ tabId })            (must run inside the click gesture)
 *       └─ chrome.storage.session.set({ [PENDING_EXPLAIN_KEY]: PendingExplain })
 *   side panel ── reads + watches PENDING_EXPLAIN_KEY ──► POST /api/explain via the background
 *
 * chrome.storage.session is only readable by trusted extension contexts (not content scripts),
 * and Chrome passes `selectionText` to the context menu even inside its PDF viewer, so this
 * works on websites, social media, PDFs and text files (e.g. .csv) opened in the browser.
 */
import { MAX_INPUT_CHARS } from '@verba/shared';
import { isRecord } from '../lib/guards';

export const EXPLAIN_MENU_ID = 'verba-explain-selection';
export const PENDING_EXPLAIN_KEY = 'verba.pendingExplain';
/** chrome.storage.local key for the side panel's chosen output language. */
export const EXPLAIN_LANGUAGE_KEY = 'verba.explainLanguage';

export interface PendingExplain {
  /** Selected text, trimmed, at most MAX_INPUT_CHARS characters. */
  text: string;
  /** Hostname of the page the text came from ("" when unknown, e.g. a local file). */
  site: string;
  /** Date.now() when the user asked; a new value means "explain this again". */
  requestedAt: number;
}

/**
 * The last email of a webmail thread, handed from the in-page Verba button to the popup so it opens in
 * reply mode. Written by the background (session storage: content scripts cannot read it back).
 */
export const PENDING_REPLY_KEY = 'verba.pendingReply';
/** Older hand-overs are ignored: the popup must open right after the click. */
export const PENDING_REPLY_MAX_AGE_MS = 60_000;

export interface PendingReply {
  /** Text of the email being answered, trimmed, at most MAX_INPUT_CHARS characters. */
  text: string;
  /** The tab it came from; the popup only uses it for that tab. */
  tabId: number;
  requestedAt: number;
}

export function isPendingReply(value: unknown): value is PendingReply {
  return (
    isRecord(value) &&
    typeof value.text === 'string' &&
    value.text.length > 0 &&
    value.text.length <= MAX_INPUT_CHARS &&
    typeof value.tabId === 'number' &&
    typeof value.requestedAt === 'number'
  );
}

export function isPendingExplain(value: unknown): value is PendingExplain {
  return (
    isRecord(value) &&
    typeof value.text === 'string' &&
    value.text.length > 0 &&
    value.text.length <= MAX_INPUT_CHARS &&
    typeof value.site === 'string' &&
    typeof value.requestedAt === 'number'
  );
}

/** Trims and caps raw selection text. Returns null when nothing usable is left. */
export function cleanSelection(raw: string | undefined): string | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  return text.length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) : text;
}
