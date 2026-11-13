/**
 * Contract between the popup and the content script.
 *
 * The content script publishes a `PageBridge` object on `globalThis[PAGE_BRIDGE_KEY]`
 * inside the extension's ISOLATED world (page scripts cannot see it). The popup reaches it
 * with `chrome.scripting.executeScript({ target: { tabId, allFrames | frameIds }, func, args })`,
 * which runs in that same isolated world and reports each frame's `frameId` with the result.
 * Permissions: "activeTab" (granted when the user opens the popup) + "scripting".
 */
export const PAGE_BRIDGE_KEY = '__verbaPageBridge';

/** Upper bound on text the bridge hands to the popup (matches the backend's input limit). */
export const MAX_FIELD_TEXT = 12_000;

export interface FocusedFieldInfo {
  /** Full current text of the field (not just a selection), trimmed of trailing whitespace, at most MAX_FIELD_TEXT chars. */
  text: string;
  /** Date.now() of the last focus/input in this field; the popup picks the newest across frames. */
  focusedAt: number;
  kind: 'input' | 'contenteditable';
  /** location.hostname of the frame, for display ("web.whatsapp.com"). */
  site: string;
}

export type InsertResult = { ok: true } | { ok: false; reason: string };

export interface PageBridge {
  /** The last focused editable field in this frame, or null (none, sensitive field, detached, or Verba disabled here). */
  readFocused(): FocusedFieldInfo | null;
  /** Replaces the WHOLE text of that field with `text`. Verifies the result; never claims unverified success. */
  insert(text: string): Promise<InsertResult>;
}
