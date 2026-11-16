import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_INPUT_CHARS } from '@verba/shared';
import {
  EXPLAIN_MENU_ID,
  PENDING_EXPLAIN_KEY,
  cleanSelection,
  isPendingExplain,
} from '../src/shared/explain';
import { handleExplainClick } from '../src/background/explain-menu';

describe('cleanSelection', () => {
  it('trims surrounding whitespace', () => {
    expect(cleanSelection('  hello world \n')).toBe('hello world');
  });

  it('returns null for empty, whitespace-only, or missing selections', () => {
    expect(cleanSelection('')).toBeNull();
    expect(cleanSelection('   \n\t ')).toBeNull();
    expect(cleanSelection(undefined)).toBeNull();
  });

  it('caps the text at MAX_INPUT_CHARS', () => {
    const result = cleanSelection('a'.repeat(MAX_INPUT_CHARS + 500));
    expect(result).not.toBeNull();
    expect(result?.length).toBe(MAX_INPUT_CHARS);
  });
});

describe('isPendingExplain', () => {
  const valid = { text: 'Explain this', site: 'example.com', requestedAt: 1700000000000 };

  it('accepts a well-formed payload', () => {
    expect(isPendingExplain(valid)).toBe(true);
    expect(isPendingExplain({ ...valid, site: '' })).toBe(true);
  });

  it('rejects non-objects', () => {
    expect(isPendingExplain(null)).toBe(false);
    expect(isPendingExplain('Explain this')).toBe(false);
    expect(isPendingExplain(undefined)).toBe(false);
  });

  it('rejects missing or mistyped fields', () => {
    expect(isPendingExplain({ site: 'example.com', requestedAt: 1 })).toBe(false);
    expect(isPendingExplain({ text: 'x', requestedAt: 1 })).toBe(false);
    expect(isPendingExplain({ text: 'x', site: 'example.com' })).toBe(false);
    expect(isPendingExplain({ ...valid, text: 42 })).toBe(false);
    expect(isPendingExplain({ ...valid, site: null })).toBe(false);
    expect(isPendingExplain({ ...valid, requestedAt: '1700000000000' })).toBe(false);
  });

  it('rejects empty text', () => {
    expect(isPendingExplain({ ...valid, text: '' })).toBe(false);
  });

  it('rejects text longer than MAX_INPUT_CHARS', () => {
    expect(isPendingExplain({ ...valid, text: 'a'.repeat(MAX_INPUT_CHARS) })).toBe(true);
    expect(isPendingExplain({ ...valid, text: 'a'.repeat(MAX_INPUT_CHARS + 1) })).toBe(false);
  });
});

describe('handleExplainClick', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubChrome() {
    const open = vi.fn((_options: unknown) => Promise.resolve());
    const set = vi.fn((_items: Record<string, unknown>) => Promise.resolve());
    vi.stubGlobal('chrome', {
      sidePanel: { open },
      storage: { session: { set } },
      windows: { WINDOW_ID_CURRENT: -2 },
    });
    return { open, set };
  }

  const tab = { id: 7, windowId: 3 } as chrome.tabs.Tab;

  it('saves the pending selection, then opens the side panel without awaiting', () => {
    const { open, set } = stubChrome();
    handleExplainClick(
      { menuItemId: EXPLAIN_MENU_ID, selectionText: '  Quarterly revenue grew  ', pageUrl: 'https://news.example.com/a?b=1' } as chrome.contextMenus.OnClickData,
      tab,
    );

    expect(open).toHaveBeenCalledWith({ tabId: 7 });
    expect(set).toHaveBeenCalledTimes(1);
    const stored = set.mock.calls[0][0];
    expect(stored[PENDING_EXPLAIN_KEY]).toMatchObject({ text: 'Quarterly revenue grew', site: 'news.example.com' });
    expect(set.mock.invocationCallOrder[0]).toBeLessThan(open.mock.invocationCallOrder[0]);
  });

  it('ignores clicks on other menu items', () => {
    const { open, set } = stubChrome();
    handleExplainClick({ menuItemId: 'some-other-item', selectionText: 'text' } as chrome.contextMenus.OnClickData, tab);
    expect(open).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it('opens the panel for the window when the tab is unknown, and skips storage for empty selections', () => {
    const { open, set } = stubChrome();
    handleExplainClick({ menuItemId: EXPLAIN_MENU_ID, selectionText: '   ' } as chrome.contextMenus.OnClickData, undefined);
    expect(open).toHaveBeenCalledWith({ windowId: -2 });
    expect(set).not.toHaveBeenCalled();
  });
});
