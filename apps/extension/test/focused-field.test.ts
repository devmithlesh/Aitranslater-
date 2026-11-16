import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { isActiveHere } from '../src/content/state';
import { installPageBridge, insert, readFocused, startFocusTracking } from '../src/content/focused-field';
import { MAX_FIELD_TEXT, PAGE_BRIDGE_KEY, type PageBridge } from '../src/shared/page-bridge';

vi.mock('../src/content/state', () => ({
  isActiveHere: vi.fn(() => true),
}));

/** jsdom has no execCommand; stub it to report failure so the native-setter fallback is exercised. */
function stubExecCommand(result: boolean): void {
  Object.defineProperty(document, 'execCommand', {
    value: vi.fn(() => result),
    configurable: true,
    writable: true,
  });
}

function append<T extends HTMLElement>(el: T): T {
  document.body.appendChild(el);
  return el;
}

function textarea(value: string): HTMLTextAreaElement {
  const el = document.createElement('textarea');
  el.value = value;
  return append(el);
}

function input(attrs: Record<string, string>): HTMLInputElement {
  const el = document.createElement('input');
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return append(el);
}

function editable(text: string): HTMLDivElement {
  const el = document.createElement('div');
  el.setAttribute('contenteditable', 'true');
  el.setAttribute('tabindex', '0');
  el.textContent = text;
  return append(el);
}

function bridge(): PageBridge {
  return (globalThis as unknown as Record<string, PageBridge>)[PAGE_BRIDGE_KEY]!;
}

beforeAll(() => {
  startFocusTracking();
  installPageBridge();
});

beforeEach(() => {
  document.body.innerHTML = '';
  stubExecCommand(false);
  vi.mocked(isActiveHere).mockReturnValue(true);
});

afterEach(() => {
  vi.mocked(isActiveHere).mockReturnValue(true);
});

describe('focus tracking', () => {
  it('reads a field that was already focused before the script loaded (no focus or input event)', async () => {
    const box = editable('kal milte hai office ke baad');
    box.focus();
    // A fresh module copy has seen no events at all, like a content script injected after focus.
    vi.resetModules();
    const fresh = await import('../src/content/focused-field');
    expect(fresh.readFocused()?.text).toBe('kal milte hai office ke baad');
    expect(fresh.readFocused()?.kind).toBe('contenteditable');
  });

  it('tracks a focused textarea and reads its full text', () => {
    const long = 'First line of a long draft\nsecond line with more words\n\n';
    const ta = textarea(long);
    ta.focus();

    const info = readFocused();
    expect(info).not.toBeNull();
    expect(info?.kind).toBe('input');
    expect(info?.text).toBe(long.trimEnd());
    expect(info?.site).toBe(location.hostname);
    expect(typeof info?.focusedAt).toBe('number');
  });

  it('caps the text at MAX_FIELD_TEXT characters', () => {
    const ta = textarea('a'.repeat(MAX_FIELD_TEXT + 500));
    ta.focus();
    expect(readFocused()?.text.length).toBe(MAX_FIELD_TEXT);
  });

  it('returns null for an empty or whitespace-only field', () => {
    const ta = textarea('   \n  ');
    ta.focus();
    expect(readFocused()).toBeNull();
  });

  it('skips password inputs and clears the previous field', () => {
    const ta = textarea('my draft');
    ta.focus();
    expect(readFocused()?.text).toBe('my draft');

    const pwd = input({ type: 'password', value: 'hunter2' });
    pwd.focus();
    expect(readFocused()).toBeNull();
  });

  it('skips autocomplete=one-time-code inputs', () => {
    const ta = textarea('draft');
    ta.focus();
    const otp = input({ type: 'text', autocomplete: 'one-time-code' });
    otp.focus();
    expect(readFocused()).toBeNull();
  });

  it('reads the text of a contenteditable host', () => {
    const host = editable('Hello from the composer');
    host.focus();

    const info = readFocused();
    expect(info?.kind).toBe('contenteditable');
    expect(info?.text).toBe('Hello from the composer');
  });

  it('returns null after the tracked element is removed', () => {
    const ta = textarea('gone soon');
    ta.focus();
    expect(readFocused()).not.toBeNull();

    ta.remove();
    expect(readFocused()).toBeNull();
  });

  it('returns null for an element inside the Verba host tag', () => {
    const host = document.createElement('verba-root');
    append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const inner = document.createElement('textarea');
    inner.value = 'verba UI text';
    shadow.appendChild(inner);
    inner.focus();

    expect(readFocused()).toBeNull();
  });

  it('returns null while Verba is disabled here', () => {
    const ta = textarea('draft');
    ta.focus();
    vi.mocked(isActiveHere).mockReturnValue(false);
    expect(readFocused()).toBeNull();
  });
});

describe('insert', () => {
  it('replaces the whole textarea value and fires an input event', async () => {
    const ta = textarea('old draft that is replaced');
    ta.focus();

    const inputEvents: Event[] = [];
    const listener = (event: Event): void => {
      inputEvents.push(event);
    };
    document.addEventListener('input', listener);
    const result = await insert('Brand new English text');
    document.removeEventListener('input', listener);

    expect(result).toEqual({ ok: true });
    expect(ta.value).toBe('Brand new English text');
    expect(inputEvents.some((event) => event.type === 'input' && event.bubbles)).toBe(true);
  });

  it('reports failure for a contenteditable when nothing applies, without throwing', async () => {
    const host = editable('draft');
    host.focus();

    const result = await insert('Hello');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/blocked automatic insert/);
    expect(host.textContent).toBe('draft');
  });

  it('returns a failure when the tracked field was removed', async () => {
    const ta = textarea('draft');
    ta.focus();
    ta.remove();
    const result = await insert('anything');
    expect(result.ok).toBe(false);
  });

  it('refuses to write while Verba is disabled here', async () => {
    const ta = textarea('draft');
    ta.focus();
    vi.mocked(isActiveHere).mockReturnValue(false);
    const result = await insert('anything');
    expect(result.ok).toBe(false);
    expect(ta.value).toBe('draft');
  });
});

describe('page bridge', () => {
  it('is installed on globalThis under PAGE_BRIDGE_KEY', () => {
    const installed = bridge();
    expect(typeof installed.readFocused).toBe('function');
    expect(typeof installed.insert).toBe('function');
  });

  it('exposes the same behaviour through the bridge', async () => {
    const ta = textarea('via bridge');
    ta.focus();
    expect(bridge().readFocused()?.text).toBe('via bridge');
    expect(await bridge().insert('replaced')).toEqual({ ok: true });
    expect(ta.value).toBe('replaced');
  });
});

describe('readSelection', () => {
  function selectContents(el: HTMLElement): void {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
  }

  it('returns highlighted page text, trimmed', () => {
    const p = append(document.createElement('p'));
    p.textContent = '  Request Management System  ';
    selectContents(p);
    expect(bridge().readSelection()).toEqual({ text: 'Request Management System', site: location.hostname });
  });

  it('returns the selected part of a focused textarea', () => {
    const ta = textarea('hello brave world');
    ta.focus();
    ta.setSelectionRange(6, 11);
    expect(bridge().readSelection()?.text).toBe('brave');
  });

  it('returns null when nothing is selected', () => {
    window.getSelection()?.removeAllRanges();
    expect(bridge().readSelection()).toBeNull();
  });

  it('never reads a password field', () => {
    const pw = input({ type: 'password' });
    pw.value = 'secret';
    pw.focus();
    pw.select();
    expect(bridge().readSelection()).toBeNull();
  });

  it('returns null when Verba is disabled on this site', () => {
    const p = append(document.createElement('p'));
    p.textContent = 'some text';
    selectContents(p);
    vi.mocked(isActiveHere).mockReturnValue(false);
    expect(bridge().readSelection()).toBeNull();
  });

  it('caps very long selections at MAX_FIELD_TEXT', () => {
    const p = append(document.createElement('p'));
    p.textContent = 'a'.repeat(MAX_FIELD_TEXT + 50);
    selectContents(p);
    expect(bridge().readSelection()?.text.length).toBe(MAX_FIELD_TEXT);
  });
});
