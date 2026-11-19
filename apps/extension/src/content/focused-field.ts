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
  type SelectionInfo,
} from '../shared/page-bridge';
import {
  activeChain,
  composedAncestors,
  deepQueryAll,
  fieldOf,
  isInsideVerba,
  isSensitiveField,
  nativeValueSetter,
  pasteText,
  selectionFor,
} from './input-handler';
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
/** True while the tracked box was picked by guessComposeField, not focused by the user. */
let guessed = false;
/** Ranking score of the guessed box. Undefined unless `guessed` is true. */
let guessScore: number | undefined;
let started = false;

/** Mirrors input-handler's editing-host walk; jsdom lacks isContentEditable, so fall back to the attribute. */
function isEditable(el: HTMLElement): boolean {
  if (typeof el.isContentEditable === 'boolean') return el.isContentEditable;
  return /^(|true|plaintext-only)$/i.test(el.getAttribute('contenteditable') ?? 'false');
}

/** The outermost editing host above `node`, within its own shadow tree. */
function editableHostOf(node: Node): HTMLElement | null {
  let current: Node | null = node;
  let host: HTMLElement | null = null;
  // A contenteditable host never spans a shadow boundary, so the walk stops there.
  while (current && !(current instanceof ShadowRoot)) {
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
  guessed = false;
  guessScore = undefined;
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

/** focusedAt for a guessed box: older than any real focus, so a focused field in another frame wins. */
const GUESSED_AT = 1;

/**
 * Elements that might be a writable box. Each match is then checked by candidateOf and excluded().
 * Deliberately broad: anything missed here cannot be guessed at all.
 */
const GUESS_SELECTOR =
  'textarea, input, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"], [role="textbox"]';

/** Placeholder, aria-label or name of a search-style box. */
const SEARCH_HINT = /search|find|filter/i;

const MIN_WIDTH = 40;
const MIN_HEIGHT = 16;

interface Candidate {
  el: HTMLElement;
  kind: FieldKind;
}

interface Guess extends Candidate {
  score: number;
}

/**
 * The writable box an element stands for, or null. Plain text inputs and textareas count as fields.
 * Any other element counts only as the outermost editing host (its editable children are part of the box).
 */
function candidateOf(node: Element): Candidate | null {
  if (node instanceof HTMLTextAreaElement || (node instanceof HTMLInputElement && node.type === 'text')) {
    return { el: node, kind: 'input' };
  }
  if (!(node instanceof HTMLElement) || !isEditable(node)) return null; // e.g. a role=textbox that cannot be typed into
  return editableHostOf(node) === node ? { el: node, kind: 'contenteditable' } : null;
}

/** True for boxes that must never be guessed: sensitive, read-only, disabled, search-like, or inside Verba. */
function excluded(el: HTMLElement): boolean {
  const field = fieldOf(el);
  if (field && (isSensitiveField(field) || field.readOnly || field.disabled)) return true;
  if (isInsideVerba(el)) return true;
  if (composedAncestors(el).some((node) => node.getAttribute('aria-disabled') === 'true')) return true;
  const role = el.getAttribute('role');
  if (role === 'combobox' || role === 'searchbox') return true;
  const hint = [el.getAttribute('placeholder'), el.getAttribute('aria-label'), el.getAttribute('name')].join(' ');
  return SEARCH_HINT.test(hint);
}

/** Visible enough to write into: not a sliver, and at least partly inside the viewport. */
function onScreen(rect: DOMRect): boolean {
  if (rect.width < MIN_WIDTH || rect.height < MIN_HEIGHT) return false;
  return rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
}

/** Top edge of the user's highlighted text, or null when nothing (or only collapsed text) is selected. */
function selectionTop(): number | null {
  const chain = activeChain();
  const deepest = chain?.[chain.length - 1];
  const sources = [deepest ? selectionFor(deepest) : null, window.getSelection()];
  for (const sel of sources) {
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) continue;
    const range = sel.getRangeAt(0);
    if (typeof range.getBoundingClientRect !== 'function') continue;
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    return rect.top;
  }
  return null;
}

/**
 * Score for a candidate box (higher wins):
 * - kind: textarea and rich editors +30, plain single-line input +10;
 * - size: up to +20 for large boxes;
 * - with a selection: boxes at or below the selected text win, the nearest first (the reply box under a
 *   comment, the composer under messages); boxes above only get a small bonus;
 * - without a selection: lower on the screen is better (chat apps keep their composer at the bottom).
 */
function scoreBox(el: HTMLElement, rect: DOMRect, selTop: number | null): number {
  let score = (el instanceof HTMLInputElement ? 10 : 30) + Math.min(20, (rect.width * rect.height) / 5000);
  if (selTop !== null) {
    const distance = rect.top - selTop;
    if (distance >= -10) score += 100 - Math.min(90, Math.max(0, distance) / 8);
    else score += Math.max(0, 20 - Math.abs(distance) / 50);
  } else {
    score += 50 * Math.min(1, Math.max(0, rect.bottom / window.innerHeight));
  }
  return score;
}

/**
 * Best guess at the box to write into when the user never clicked one (for example, they only
 * selected a received message). Searches open shadow roots too. Password, card, one-time-code,
 * search, read-only and Verba's own boxes are never chosen. See scoreBox for the ranking.
 */
function guessComposeField(): Guess | null {
  const selTop = selectionTop();
  let best: Guess | null = null;
  for (const node of deepQueryAll<Element>(document, GUESS_SELECTOR)) {
    const candidate = candidateOf(node);
    if (!candidate || excluded(candidate.el)) continue;
    const rect = candidate.el.getBoundingClientRect();
    if (!onScreen(rect)) continue;
    const score = scoreBox(candidate.el, rect, selTop);
    if (!best || score > best.score) best = { ...candidate, score };
  }
  return best;
}

/** The tracked element when it is still in the document and usable, else null. */
function trackedTarget(): { el: HTMLElement; kind: FieldKind } | null {
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

/**
 * The field to read or write. Order: the tracked field; else the element that has focus right now
 * (a field can be focused before this script loaded, and selecting text fires no focusin/input);
 * else the guessed message box, which is then tracked so a later insert targets the same box.
 */
function currentTarget(): { el: HTMLElement; kind: FieldKind } | null {
  if (!tracked) onFocusOrInput();
  let target = trackedTarget();
  if (!target) {
    // The tracked field went away; the element focused right now is the next best answer.
    onFocusOrInput();
    target = trackedTarget();
  }
  if (target) return target;
  const guess = guessComposeField();
  if (!guess) return null;
  tracked = { ref: new WeakRef(guess.el), kind: guess.kind };
  focusedAt = GUESSED_AT;
  guessed = true;
  guessScore = guess.score;
  return guess;
}

/**
 * The field to write into in this frame, or null (none, sensitive, detached, or Verba disabled here).
 * An empty field is still returned (text ""), so a reply can be inserted into an empty message box.
 */
export function readFocused(): FocusedFieldInfo | null {
  try {
    const target = currentTarget();
    if (!target || !isActiveHere()) return null;
    const { el, kind } = target;
    const raw = kind === 'input' ? (el as HTMLInputElement | HTMLTextAreaElement).value : visibleText(el);
    const text = raw.trimEnd().slice(0, MAX_FIELD_TEXT);
    const info: FocusedFieldInfo = { text, focusedAt, kind, site: location.hostname, guessed };
    if (guessed && guessScore !== undefined) info.guessScore = guessScore;
    return info;
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

/** Moves the caret to the end of a contenteditable host. Cosmetic: failures are ignored. */
function placeCaretAtEnd(host: HTMLElement): void {
  try {
    const range = document.createRange();
    range.selectNodeContents(host);
    range.collapse(false);
    const sel = selectionFor(host);
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {
    // Caret placement is cosmetic.
  }
}

/** Frameworks that own their document model: writing their DOM directly would desync them. */
const FRAMEWORK_SELECTOR = [
  '[data-lexical-editor]',
  '.ProseMirror',
  '[data-slate-editor]',
  '.DraftEditor-root',
  '.ql-editor',
  '.ck-editor__editable',
  '[data-contents]',
  '.public-DraftEditor-content',
].join(', ');

function hasFrameworkMarkers(host: HTMLElement): boolean {
  return composedAncestors(host).some((node) => node.matches(FRAMEWORK_SELECTOR));
}

/** Dispatches a cancelable beforeinput. True when an editor took it over (it called preventDefault). */
function dispatchBeforeInput(host: HTMLElement, text: string, inputType: string): boolean {
  if (typeof InputEvent !== 'function') return false;
  try {
    const dataTransfer = typeof DataTransfer === 'function' ? new DataTransfer() : null;
    dataTransfer?.setData('text/plain', text);
    const event = new InputEvent('beforeinput', {
      inputType,
      data: text,
      dataTransfer,
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    host.dispatchEvent(event);
    return event.defaultPrevented;
  } catch {
    return false;
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

/**
 * Replaces the text of a contenteditable box. Methods run in order, from least to most intrusive:
 *   1. execCommand('insertText');
 *   2. beforeinput (insertReplacementText, then insertText if the first was not handled), for
 *      Lexical, ProseMirror and Slate-style editors;
 *   3. synthetic paste (Draft.js and others);
 *   4. direct text write, ONLY for plain contenteditables with no framework markers.
 * Every method reselects the whole box first. After each one the insert is judged: if the box shows
 * the text, or changed at all, it stops, so a later method can never insert the text a second time.
 */
async function insertIntoEditable(host: HTMLElement, text: string): Promise<InsertResult> {
  const before = normalize(visibleText(host));
  host.focus({ preventScroll: true });

  /** True once the box shows the text, or has changed at all (an editor may render the text differently). */
  const landed = async (): Promise<boolean> => {
    if (await waitForText(host, text)) return true;
    return normalize(visibleText(host)) !== before;
  };

  // 1. execCommand. Rich editors (Lexical, Draft.js) apply it asynchronously, hence the wait in landed().
  selectHostContents(host);
  if (typeof document.execCommand === 'function') {
    try {
      document.execCommand('insertText', false, text);
    } catch {
      // Judged by landed() below.
    }
  }
  if (await landed()) return { ok: true };

  // 2. beforeinput. An editor that calls preventDefault has taken the insert over.
  for (const inputType of ['insertReplacementText', 'insertText']) {
    selectHostContents(host);
    if (!dispatchBeforeInput(host, text, inputType)) continue; // Not handled: try the next input type.
    if (await landed()) return { ok: true };
    break; // Handled but not shown: do not hand the same insert to another method.
  }

  // 3. Synthetic paste. Some editors accept only pastes.
  selectHostContents(host);
  if (pasteText(host, text) && (await landed())) return { ok: true };

  // 4. Last resort. Only for plain contenteditables: writing the DOM of a framework editor would
  // corrupt its state, so those stay blocked.
  if (!hasFrameworkMarkers(host)) {
    host.textContent = text;
    placeCaretAtEnd(host);
    host.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: text }));
    if (await landed()) return { ok: true };
  }
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

/**
 * The text the user highlighted in this frame. Inside an input/textarea the document selection is
 * empty, so the field's own selection range is used. Sensitive fields are never read.
 */
export function readSelection(): SelectionInfo | null {
  try {
    if (!isActiveHere()) return null;
    const chain = activeChain();
    const deepest = chain?.[chain.length - 1];

    let raw = '';
    const field = deepest ? fieldOf(deepest) : null;
    if (deepest && isSensitiveTarget(deepest)) return null;
    if (field && field.selectionStart !== null && field.selectionEnd !== null) {
      raw = field.value.slice(field.selectionStart, field.selectionEnd);
    }
    if (!raw.trim()) {
      const sel = deepest ? selectionFor(deepest) : window.getSelection();
      raw = sel?.toString() ?? '';
    }

    const text = raw.trim();
    if (!text) return null;
    return { text: text.slice(0, MAX_FIELD_TEXT), site: location.hostname };
  } catch {
    return null;
  }
}

/** Publishes the bridge on globalThis in the isolated world, where only Verba's own code can reach it. */
export function installPageBridge(): void {
  const bridge: PageBridge = { readFocused, readSelection, insert };
  try {
    Object.defineProperty(globalThis, PAGE_BRIDGE_KEY, { value: bridge, configurable: true });
  } catch {
    // Non-configurable from an earlier install: keep the existing bridge.
  }
}
