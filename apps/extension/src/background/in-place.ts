/**
 * "Translate what I typed" shortcut. The user types in a message box (WhatsApp, Gmail…), presses the
 * shortcut, and the text in that box is replaced by its translation, without opening the popup.
 *
 * The page bridge reads and fills the box exactly as the popup does; the language is the one the popup
 * remembers (default English). Tell the user what is happening with a small toast on the page.
 */
import type { TranslateVariantsResponse } from '@verba/shared';
import { insertIntoField, readFocusedField } from '../popup/translator/pageBridgeClient';
import { callBackend } from './backend';

/** chrome.storage.local keys owned by the popup's translator (see TranslatorView / VariantTabs). */
const TARGET_KEY = 'verba.popup.target';
const VARIANT_KEY = 'verba.popup.variant';
const DEFAULT_TARGET = 'en';
const DEFAULT_STYLE = 'natural';

type ToastKind = 'busy' | 'ok' | 'error';

/** Tabs with a translation running, so a second press does not spend a second credit. */
const running = new Set<number>();

/** Shows a short message in the page's top frame. Serialized by Chrome: it must not use anything outside itself. */
function toastInPage(message: string, kind: string): void {
  const id = 'verba-toast-host';
  document.getElementById(id)?.remove();
  const host = document.createElement('div');
  host.id = id;
  host.style.cssText = 'all: initial; position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;';
  const root = host.attachShadow({ mode: 'open' });
  const box = document.createElement('div');
  box.setAttribute('role', 'status');
  box.textContent = message;
  const colour = kind === 'error' ? '#b91c1c' : kind === 'ok' ? '#15803d' : '#4f46e5';
  box.style.cssText = `font: 600 13px/1.35 system-ui, sans-serif; color: #fff; background: ${colour}; padding: 10px 14px; border-radius: 10px; max-width: 320px; box-shadow: 0 6px 24px rgba(0, 0, 0, .35);`;
  root.append(box);
  document.documentElement.append(host);
  window.setTimeout(() => host.remove(), kind === 'busy' ? 30_000 : 3_500);
}

async function toast(tabId: number, message: string, kind: ToastKind): Promise<void> {
  try {
    await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, func: toastInPage, args: [message, kind] });
  } catch {
    // A page that cannot be scripted (chrome:// pages): there is nowhere to show it.
  }
}

async function readSetting(key: string, fallback: string): Promise<string> {
  try {
    const stored = (await chrome.storage.local.get(key))[key];
    return typeof stored === 'string' && stored !== '' ? stored : fallback;
  } catch {
    return fallback;
  }
}

/** Translates the text in the box the user is typing in, and puts the result back in the same box. */
export async function translateInPlace(tab: chrome.tabs.Tab | undefined): Promise<void> {
  const tabId = tab?.id;
  if (typeof tabId !== 'number' || running.has(tabId)) return;
  running.add(tabId);
  try {
    const field = await readFocusedField();
    const text = field?.info.text.trim() ?? '';
    // A box Verba only guessed at (the user never clicked it) is not read: it may not be the one they mean.
    if (!field || field.info.guessed || text === '') {
      await toast(tabId, 'Click in the message box and type something first.', 'error');
      return;
    }

    await toast(tabId, 'Translating…', 'busy');
    const targetLang = await readSetting(TARGET_KEY, DEFAULT_TARGET);
    const res = await callBackend('POST', '/translate-variants', { text, sourceLang: 'auto', targetLang });
    if (!res.ok) {
      await toast(tabId, res.error.message, 'error');
      return;
    }
    const variants = (res.data as Partial<TranslateVariantsResponse> | null)?.variants;
    const wanted = await readSetting(VARIANT_KEY, DEFAULT_STYLE);
    const pick = Array.isArray(variants) ? (variants.find((v) => v.style === wanted) ?? variants[0]) : undefined;
    if (!pick || typeof pick.text !== 'string' || pick.text.trim() === '') {
      await toast(tabId, 'No translation came back. Try again.', 'error');
      return;
    }

    const inserted = await insertIntoField(field.tabId, field.frameId, pick.text);
    if (inserted.ok) {
      await toast(tabId, 'Translated ✓', 'ok');
    } else {
      await toast(tabId, inserted.reason, 'error');
    }
  } finally {
    running.delete(tabId);
  }
}
