import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { isActiveHere } from '../src/content/state';
import { installPageBridge, insert, readFocused, startFocusTracking } from '../src/content/focused-field';
import { MAX_FIELD_TEXT, PAGE_BRIDGE_KEY, type PageBridge } from '../src/shared/page-bridge';
import { pickBest } from '../src/popup/translator/pageBridgeClient';

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

  it('reports an empty or whitespace-only field with empty text, so a reply can be inserted into it', () => {
    const ta = textarea('   \n  ');
    ta.focus();
    expect(readFocused()).toMatchObject({ text: '', kind: 'input' });
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

/** jsdom has no layout: give an element a box on screen. */
function place<T extends HTMLElement>(el: T, top: number, height = 40, width = 300): T {
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({ top, bottom: top + height, left: 0, right: width, width, height, x: 0, y: top, toJSON: () => ({}) }),
    configurable: true,
  });
  return el;
}

describe('message box guess (nothing focused)', () => {
  beforeEach(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    // Forget the field tracked by earlier tests: removing it from the document makes it stale.
    readFocused();
  });

  it('picks the visible box lowest on the screen and inserts into it', async () => {
    const search = place(textarea(''), 10);
    const composer = place(editable(''), 600);
    expect(readFocused()).toMatchObject({ text: '', kind: 'contenteditable', focusedAt: 1, guessed: true });

    stubExecCommand(false);
    await insert('Not yet, sir!');
    expect(search.value).toBe('');
    // jsdom cannot run the rich-editor insert, but it must target the composer, not the search box.
    expect(document.activeElement).toBe(composer);
  });

  it('never picks password, read-only, hidden or off-screen fields', () => {
    place(input({ type: 'password' }), 700);
    const ro = place(textarea('x'), 650);
    ro.readOnly = true;
    place(textarea('hidden'), 600, 0, 0);
    place(textarea('below the fold'), 2000);
    const ok = place(textarea('draft'), 300);
    expect(readFocused()?.text).toBe('draft');
    expect(ok.value).toBe('draft');
  });

  it('returns null when the page has no writable box', () => {
    place(input({ type: 'password' }), 500);
    expect(readFocused()).toBeNull();
  });

  it('prefers the field the user actually focused over the guess', () => {
    place(textarea('bottom box'), 700);
    const top = place(textarea('clicked box'), 50);
    top.focus();
    expect(readFocused()).toMatchObject({ text: 'clicked box', guessed: false });
  });
});

describe('guess: shadow DOM, exclusions and selection ranking', () => {
  beforeEach(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.getSelection()?.removeAllRanges();
    readFocused();
  });

  it('finds a contenteditable inside an open shadow root and inserts into it', async () => {
    const composer = append(document.createElement('x-composer'));
    const shadow = composer.attachShadow({ mode: 'open' });
    const box = document.createElement('div');
    box.setAttribute('contenteditable', 'true');
    shadow.appendChild(box);
    place(box, 500);
    box.addEventListener('beforeinput', (event) => {
      event.preventDefault();
      box.textContent = 'shadow reply';
    });

    expect(readFocused()).toMatchObject({ kind: 'contenteditable', guessed: true, text: '' });
    expect(await insert('shadow reply')).toEqual({ ok: true });
    expect(box.textContent).toBe('shadow reply');
  });

  it('ignores search, email, combobox, search-named and Verba-hosted boxes', () => {
    place(input({ type: 'search' }), 700);
    place(input({ type: 'email' }), 680);
    place(input({ type: 'text', placeholder: 'Search messages' }), 660);
    const combo = place(editable('combo'), 640);
    combo.setAttribute('role', 'combobox');
    const verba = append(document.createElement('verba-root'));
    const verbaBox = document.createElement('textarea');
    verba.attachShadow({ mode: 'open' }).appendChild(verbaBox);
    place(verbaBox, 620);
    place(textarea('the real draft'), 300);

    expect(readFocused()).toMatchObject({ text: 'the real draft', guessed: true });
  });

  it('without a selection, the lowest box wins', () => {
    place(textarea('upper'), 100);
    place(textarea('lower'), 500);
    expect(readFocused()?.text).toBe('lower');
  });

  describe('with a text selection', () => {
    let selection: { mockRestore(): void } | undefined;

    afterEach(() => {
      selection?.mockRestore();
      selection = undefined;
    });

    /** Fakes a selection whose range starts at `top` (jsdom has no range layout). */
    function selectAt(top: number): void {
      const range = {
        getBoundingClientRect: () => ({ top, bottom: top + 20, left: 0, right: 100, width: 100, height: 20, x: 0, y: top, toJSON: () => ({}) }),
      };
      const fake = {
        rangeCount: 1,
        isCollapsed: false,
        getRangeAt: () => range,
        removeAllRanges: () => {},
        addRange: () => {},
        toString: () => 'selected text',
      };
      selection = vi.spyOn(window, 'getSelection').mockReturnValue(fake as unknown as Selection);
    }

    it('the box just below the selected text beats a box far lower on the page', () => {
      selectAt(100);
      place(textarea('far box'), 600);
      place(editable('reply box'), 140);
      expect(readFocused()).toMatchObject({ text: 'reply box', kind: 'contenteditable', guessed: true });
    });
  });
});

describe('pickBest (choosing between frames)', () => {
  function frame(frameId: number, info: Record<string, unknown>) {
    return { frameId, result: { text: 'x', focusedAt: 1, kind: 'input', site: 'example.test', ...info } };
  }

  it('a focused field beats a guessed one even when the guess scores higher', () => {
    const best = pickBest([frame(1, { guessed: true, focusedAt: 1, guessScore: 999 }), frame(2, { focusedAt: 50 })], 7);
    expect(best).toMatchObject({ frameId: 2, tabId: 7 });
  });

  it('among focused fields the newest wins', () => {
    const best = pickBest([frame(1, { focusedAt: 50 }), frame(2, { focusedAt: 90 })], 7);
    expect(best?.frameId).toBe(2);
  });

  it('among guessed fields the higher guessScore wins', () => {
    const best = pickBest([frame(1, { guessed: true, focusedAt: 1, guessScore: 30 }), frame(2, { guessed: true, focusedAt: 1, guessScore: 70 })], 7);
    expect(best?.frameId).toBe(2);
  });

  it('returns null when no frame reported a field', () => {
    expect(pickBest([{ frameId: 0, result: 'verba:missing-bridge' }], 7)).toBeNull();
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

  it('reports failure for a framework editor when nothing applies, without throwing', async () => {
    // A plain contenteditable would get the direct-write fallback; a framework editor must not.
    const host = editable('draft');
    host.setAttribute('data-lexical-editor', 'true');
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

describe('insert into rich editors', () => {
  it('inserts through a beforeinput the editor handles, exactly once', async () => {
    const host = editable('old text');
    host.focus();
    let handled = 0;
    host.addEventListener('beforeinput', (event) => {
      event.preventDefault();
      handled += 1;
      host.textContent = 'Reply from Verba';
    });

    expect(await insert('Reply from Verba')).toEqual({ ok: true });
    expect(host.textContent).toBe('Reply from Verba');
    expect(handled).toBe(1);
  });

  it('falls back to setting the text on a plain contenteditable when nothing else works', async () => {
    const host = editable('draft');
    host.focus();
    // execCommand is stubbed to fail (beforeinput and paste are ignored by this box).
    expect(await insert('Last resort reply')).toEqual({ ok: true });
    expect(host.textContent).toBe('Last resort reply');
  });

  it('leaves a framework-marked editor untouched when it ignores every method', async () => {
    const host = editable('Keep me');
    host.setAttribute('data-lexical-editor', 'true');
    host.focus();

    const result = await insert('Overwrite');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/blocked automatic insert/);
    expect(host.textContent).toBe('Keep me');
  });

  it('does not insert twice when the editor applies execCommand asynchronously', async () => {
    const host = editable('draft');
    host.focus();
    let pastes = 0;
    let beforeInputs = 0;
    host.addEventListener('paste', () => {
      pastes += 1;
    });
    host.addEventListener('beforeinput', () => {
      beforeInputs += 1;
    });
    Object.defineProperty(document, 'execCommand', {
      value: vi.fn(() => {
        setTimeout(() => {
          host.textContent = 'Late reply';
        }, 120);
        return true;
      }),
      configurable: true,
      writable: true,
    });

    expect(await insert('Late reply')).toEqual({ ok: true });
    await delay(300);
    expect(host.textContent).toBe('Late reply');
    expect(pastes).toBe(0);
    expect(beforeInputs).toBe(0);
  });
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
    expect(bridge().readSelection()).toEqual({ text: 'Request Management System', site: location.hostname, inEditable: false });
  });

  it('returns the selected part of a focused textarea', () => {
    const ta = textarea('hello brave world');
    ta.focus();
    ta.setSelectionRange(6, 11);
    expect(bridge().readSelection()?.text).toBe('brave');
  });

  it('marks text highlighted inside the message box, so the popup does not offer Explain or Reply for it', () => {
    const ta = textarea('hello brave world');
    ta.focus();
    ta.setSelectionRange(6, 11);
    expect(bridge().readSelection()?.inEditable).toBe(true);
  });

  it('marks text highlighted in a contenteditable box too', () => {
    const box = append(document.createElement('div'));
    box.setAttribute('contenteditable', 'true');
    box.textContent = 'hi there friend';
    box.focus();
    selectContents(box);
    expect(bridge().readSelection()?.inEditable).toBe(true);
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

describe('webmail signatures', () => {
  function gmailCompose(draft: string): HTMLDivElement {
    const box = editable('');
    box.innerHTML = `<div>${draft}</div><span class="gmail_signature_prefix">-- </span><div class="gmail_signature" data-smartmail="gmail_signature">Mithlesh Nirmal<br>TEAM LEAD</div>`;
    return box;
  }

  it('reads only the text above a Gmail signature, so the signature is never translated', () => {
    const box = gmailCompose('kal milte hai');
    box.focus();
    expect(readFocused()?.text).toBe('kal milte hai');
  });

  it('reads an empty draft when the box holds only the signature', () => {
    const box = gmailCompose('');
    box.focus();
    expect(readFocused()?.text).toBe('');
  });
});
