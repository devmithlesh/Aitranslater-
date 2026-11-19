/**
 * DOM helpers for finding and editing the user's text field (inputs, textareas,
 * contenteditable editors, including inside open shadow roots). Used by focused-field.ts.
 */

/** Custom element name of Verba's own UI host. Anything inside it is never treated as a user field. */
export const HOST_TAG = 'verba-root';

const TEXT_INPUT_TYPES: ReadonlySet<string> = new Set(['text', 'search', 'email', 'url', 'tel']);

type ShadowRootWithSelection = ShadowRoot & { getSelection?: () => Selection | null };

/** The focused element chain through open shadow roots. Null when focus is inside Verba's own UI. */
export function activeChain(): Element[] | null {
  const chain: Element[] = [];
  let el: Element | null = document.activeElement;
  while (el) {
    if (el.localName === HOST_TAG) return null;
    chain.push(el);
    el = el.shadowRoot?.activeElement ?? null;
  }
  return chain;
}

/** The node's element ancestors, crossing open shadow boundaries (closest() stops at them). */
export function composedAncestors(node: Node): Element[] {
  const out: Element[] = [];
  let current: Node | null = node;
  while (current) {
    if (current instanceof Element) out.push(current);
    current = current instanceof ShadowRoot ? current.host : current.parentNode;
  }
  return out;
}

/** True when `el` is inside Verba's own UI host, including through shadow boundaries. */
export function isInsideVerba(el: Node): boolean {
  return composedAncestors(el).some((ancestor) => ancestor.localName === HOST_TAG);
}

/**
 * Every element matching `selector` under `root`, descending into open shadow roots.
 * Closed shadow roots are not reachable and are skipped.
 */
export function deepQueryAll<T extends Element>(root: Document | ShadowRoot, selector: string): T[] {
  const found: T[] = [];
  for (const el of Array.from(root.querySelectorAll<T>(selector))) found.push(el);
  for (const host of Array.from(root.querySelectorAll('*'))) {
    if (!host.shadowRoot) continue;
    for (const el of deepQueryAll<T>(host.shadowRoot, selector)) found.push(el);
  }
  return found;
}

/** Selection object for the tree that holds `node` (open shadow roots expose their own). */
export function selectionFor(node: Node): Selection | null {
  const rootNode = node.getRootNode();
  if (rootNode instanceof ShadowRoot) {
    const getSel = (rootNode as ShadowRootWithSelection).getSelection;
    if (typeof getSel === 'function') {
      const sel = getSel.call(rootNode);
      if (sel) return sel;
    }
  }
  return window.getSelection();
}

/** Password, payment-card and one-time-code fields are never read or written. */
export function isSensitiveField(el: HTMLInputElement | HTMLTextAreaElement): boolean {
  if (el instanceof HTMLInputElement && el.type === 'password') return true;
  const tokens = (el.getAttribute('autocomplete') ?? '').toLowerCase().split(/\s+/);
  return tokens.some((token) => token.startsWith('cc-') || token === 'one-time-code');
}

/** The element as a plain text field, or null for other inputs (number, checkbox, ...) and non-fields. */
export function fieldOf(el: Element): HTMLInputElement | HTMLTextAreaElement | null {
  if (el instanceof HTMLTextAreaElement) return el;
  if (el instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(el.type)) return el;
  return null;
}

/** The prototype's value setter, which bypasses framework value trackers (React). */
export function nativeValueSetter(el: HTMLInputElement | HTMLTextAreaElement): ((value: string) => void) | null {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  return setter ?? null;
}

/** Dispatches a synthetic paste of `text`; rich editors (Draft.js, Lexical, Slate) often handle it. */
export function pasteText(root: HTMLElement, text: string): boolean {
  if (typeof DataTransfer !== 'function' || typeof ClipboardEvent !== 'function') return false;
  try {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    root.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    return true;
  } catch {
    return false;
  }
}
