/**
 * Tracks the editable field the user last focused or typed in, and exposes it to the
 * popup through `globalThis[PAGE_BRIDGE_KEY]` (see shared/page-bridge.ts).
 *
 * Nothing is read until the popup asks, and nothing is stored beyond one element reference.
 */
import {
  MAX_FIELD_TEXT,
  PAGE_BRIDGE_KEY,
  type FocusedFieldInfo,
  type InsertResult,
  type PageBridge,
} from '../shared/page-bridge';
import { activeChain, isSensitiveField, fieldOf, nativeValueSetter, pasteText, selectionFor } from './input-handler';
import { isActiveHere } from './state';

export const NO_FIELD_REASON = 'Click into the text box you want to change, then try again.';
/** The popup appends the clipboard fallback note, so this only states what happened. */
export const BLOCKED_REASON = 'This site blocked automatic insert.';

/** Delays (ms) between checks while waiting for a rich editor to apply an insert. */
const SETTLE_DELAYS_MS = [50, 100, 200] as const;

type FieldKind = FocusedFieldInfo['kind'];

interface Tracked {
  ref: WeakRef<HTMLElement>;
  kind: FieldKind;
}

let tracked: Tracked | null = null;
let focusedAt = 0;
let started = false;

/** Mirrors input-handler's editing-host walk; jsdom lacks isContentEditable, so fall back to the attribute. */
function isEditable(el: HTMLElement): boolean {
  if (typeof el.isContentEditable === 'boolean') return el.isContentEditable;
  return /^(|true|plaintext-only)$/i.test(el.getAttribute('contenteditable') ?? 'false');
}

function editableHostOf(node: Node): HTMLElement | null {
  let current: Node | null = node;
  let host: HTMLElement | null = null;
  while (current) {
    if (current instanceof HTMLElement && isEditable(current)) host = current;
    current = current.parentNode;
  }
  return host;
}

/** Text of an element as the user sees it (innerText where implemented, else textContent). */
function visibleText(el: HTMLElement): string {
  return typeof el.innerText === 'string' ? el.innerText : (el.textContent ?? '');
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function track(el: HTMLElement, kind: FieldKind): void {
  tracked = { ref: new WeakRef(el), kind };
  focusedAt = Date.now();
}

/** Clears tracking when the focused element is a password or one-time-code style field. */
function isSensitiveTarget(el: Element): boolean {
  return (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && isSensitiveField(el);
}

function onFocusOrInput(): void {
  try {
    const chain = activeChain();
    if (!chain) return; // Focus is inside Verba's own UI.
    const deepest = chain[chain.length - 1];
    if (!deepest) return;

    if (isSensitiveTarget(deepest)) {
      tracked = null;
      return;
    }
    const field = fieldOf(deepest);
    if (field) {
      if (field.readOnly || field.disabled) return;
      track(field, 'input');
      return;
    }
    const host = editableHostOf(deepest);
    if (host) track(host, 'contenteditable');
  } catch {
    // Tracking is best-effort; a failure must never affect the page.
  }
}

/**
 * The tracked element when it is still in the document and usable, else null. When nothing was
 * tracked, falls back to the element that has focus right now: a field can be focused before this
 * script loaded (sites restore focus on reload) and the user may only select text without typing,
 * so no focusin/input event ever reaches us. activeElement stays on that field while the popup is open.
 */
function currentTarget(): { el: HTMLElement; kind: FieldKind } | null {
  if (!tracked) onFocusOrInput();
  if (!tracked) return null;
  const el = tracked.ref.deref();
  if (!el || !el.isConnected) {
    tracked = null;
    return null;
  }
  if (tracked.kind === 'input') {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return null;
    if (isSensitiveField(el) || el.readOnly || el.disabled) return null;
  }
  return { el, kind: tracked.kind };
}

/** The last focused editable field in this frame, or null (none, sensitive, detached, or Verba disabled here). */
export function readFocused(): FocusedFieldInfo | null {
  try {
    const target = currentTarget();
    if (!target || !isActiveHere()) return null;
    const { el, kind } = target;
    const raw = kind === 'input' ? (el as HTMLInputElement | HTMLTextAreaElement).value : visibleText(el);
    const text = raw.trimEnd().slice(0, MAX_FIELD_TEXT);
    if (!text.trim()) return null;
    return { text, focusedAt, kind, site: location.hostname };
  } catch {
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Waits until the editor shows `text`, checking after each delay. */
async function waitForText(el: HTMLElement, text: string): Promise<boolean> {
  const wanted = normalize(text);
  for (const ms of SETTLE_DELAYS_MS) {
    await delay(ms);
    if (normalize(visibleText(el)) === wanted) return true;
  }
  return false;
}

/** Selects everything inside a contenteditable host so the next insert replaces it. */
function selectHostContents(host: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(host);
  const sel = selectionFor(host);
  if (sel) {
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

function insertIntoField(el: HTMLInputElement | HTMLTextAreaElement, text: string): InsertResult {
  el.focus({ preventScroll: true });
  try {
    el.setSelectionRange(0, el.value.length);
  } catch {
    // Some input types reject selection APIs; the fallback below still works.
  }

  let inserted = false;
  if (typeof document.execCommand === 'function') {
    try {
      inserted = document.execCommand('insertText', false, text);
    } catch {
      inserted = false;
    }
  }
  if (inserted && el.value === text) return { ok: true };

  // Fallback: native setter bypasses framework value trackers; the input event tells
  // React and other listeners that the value changed.
  const setter = nativeValueSetter(el);
  if (!setter) return { ok: false, reason: BLOCKED_REASON };
  setter.call(el, text);
  try {
    el.setSelectionRange(text.length, text.length);
  } catch {
    // Caret placement is cosmetic.
  }
  el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertReplacementText', data: text }));
  el.dispatchEvent(new Event('change', { bubbles: true }));

  return el.value === text ? { ok: true } : { ok: false, reason: BLOCKED_REASON };
}

async function insertIntoEditable(host: HTMLElement, text: string): Promise<InsertResult> {
  const before = normalize(visibleText(host));
  host.focus({ preventScroll: true });
  selectHostContents(host);

  if (typeof document.execCommand === 'function') {
    try {
      document.execCommand('insertText', false, text);
    } catch {
      // Fall through to the verification below.
    }
  }
  // Rich editors (Lexical, Draft.js) apply inserts asynchronously, so wait before judging.
  // Pasting before this check would double the text in editors that applied execCommand late.
  if (await waitForText(host, text)) return { ok: true };
  // The editor did change the box, but renders it differently (e.g. emoji shortcodes turned into
  // images). The insert landed: pasting now would add the text a second time.
  if (normalize(visibleText(host)) !== before) return { ok: true };

  // Some editors ignore execCommand but handle paste. Reselect first so the paste replaces
  // whatever is there.
  selectHostContents(host);
  if (pasteText(host, text) && (await waitForText(host, text))) return { ok: true };
  return { ok: false, reason: BLOCKED_REASON };
}

/** Replaces the WHOLE text of the tracked field with `text`. Verifies the result; never throws. */
export async function insert(text: string): Promise<InsertResult> {
  try {
    const target = currentTarget();
    if (!target || !isActiveHere()) return { ok: false, reason: NO_FIELD_REASON };
    if (target.kind === 'input') {
      return insertIntoField(target.el as HTMLInputElement | HTMLTextAreaElement, text);
    }
    return await insertIntoEditable(target.el, text);
  } catch {
    return { ok: false, reason: BLOCKED_REASON };
  }
}

/** Starts listening for focus and input in this frame. Capture phase so page handlers cannot hide events. */
export function startFocusTracking(): void {
  if (started) return;
  started = true;
  try {
    document.addEventListener('focusin', onFocusOrInput, true);
    document.addEventListener('input', onFocusOrInput, true);
    // Pick up a field that was already focused before this script ran.
    onFocusOrInput();
  } catch {
    // No document (should not happen in a content script): stay idle.
  }
}

/** Publishes the bridge on globalThis in the isolated world, where only Verba's own code can reach it. */
export function installPageBridge(): void {
  const bridge: PageBridge = { readFocused, insert };
  try {
    Object.defineProperty(globalThis, PAGE_BRIDGE_KEY, { value: bridge, configurable: true });
  } catch {
    // Non-configurable from an earlier install: keep the existing bridge.
  }
}
