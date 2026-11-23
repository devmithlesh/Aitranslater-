/**
 * A small Verba button that floats at the corner of the message box on webmail sites. One click
 * opens the Verba popup, so translating or drafting a reply does not need the toolbar icon.
 *
 * The button lives in a shadow root under <verba-root>, so page styles cannot change it and
 * focus-tracking ignores it. It never reads the page: the popup does that through the page bridge,
 * exactly as when it is opened from the toolbar. Only the top frame shows it.
 */
import { HOST_TAG, composedAncestors } from './input-handler';
import { isActiveHere } from './state';

/** Webmail hosts that get the button. Other sites keep using the toolbar icon and Alt+Shift+V. */
const MAIL_HOSTS: readonly string[] = [
  'mail.google.com',
  'outlook.live.com',
  'outlook.office.com',
  'outlook.office365.com',
  'mail.yahoo.com',
  'mail.proton.me',
];

/** Only large boxes (a message body), not search bars or subject lines. */
const MIN_WIDTH = 240;
const MIN_HEIGHT = 90;
const SIZE = 32;
const MARGIN = 10;
const HIDE_DELAY_MS = 250;

function isMailHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return MAIL_HOSTS.some((mail) => host === mail || host.endsWith(`.${mail}`));
}

function isEditable(el: Element): boolean {
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  return el instanceof HTMLElement && el.isContentEditable;
}

/** The outermost editable ancestor: Gmail focuses a child of the message body. */
function editableRoot(el: Element): HTMLElement | null {
  let found: HTMLElement | null = null;
  for (const ancestor of composedAncestors(el)) {
    if (ancestor instanceof HTMLElement && isEditable(ancestor)) found = ancestor;
    else if (found) break;
  }
  return found;
}

const STYLE = `
  :host { all: initial; }
  button {
    all: unset; box-sizing: border-box; width: ${SIZE}px; height: ${SIZE}px; border-radius: 50%;
    display: grid; place-items: center; cursor: pointer; color: #fff;
    background: linear-gradient(135deg, #7c5cff, #3b82f6);
    box-shadow: 0 4px 14px rgba(59, 70, 200, .45), 0 0 0 2px rgba(255, 255, 255, .85);
    font: 700 15px/1 system-ui, sans-serif; transition: transform .12s ease;
  }
  button:hover { transform: scale(1.08); }
  button:focus-visible { outline: 2px solid #1d4ed8; outline-offset: 2px; }
`;

/** Bodies of the emails shown in an open thread, per webmail. The compose box is never one of them. */
const MESSAGE_BODY_SELECTORS: ReadonlyArray<{ host: string; selector: string }> = [
  { host: 'mail.google.com', selector: 'div.a3s' },
  { host: 'outlook', selector: 'div[aria-label="Message body"], div[role="document"]' },
  { host: 'mail.yahoo.com', selector: 'div[data-test-id="message-view-body-content"]' },
];
/** Longest email text handed to the popup (the reply only uses the end of very long mails). */
const MAX_EMAIL_CHARS = 12_000;

/** Text of the last email in the open thread, or '' when there is none (a new message, an inbox view). */
function lastEmailText(compose: HTMLElement | null): string {
  const host = location.hostname.toLowerCase();
  const entry = MESSAGE_BODY_SELECTORS.find((item) => host.includes(item.host));
  if (!entry) return '';
  const bodies = Array.from(document.querySelectorAll<HTMLElement>(entry.selector)).filter(
    (el) =>
      !(compose && (compose.contains(el) || el.contains(compose))) &&
      !el.isContentEditable &&
      el.getClientRects().length > 0 &&
      el.innerText.trim() !== '',
  );
  const last = bodies[bodies.length - 1];
  return last ? last.innerText.trim().slice(-MAX_EMAIL_CHARS) : '';
}

export function startLauncher(): void {
  if (window !== window.top || !isMailHost(location.hostname)) return;

  let host: HTMLElement | null = null;
  let button: HTMLButtonElement | null = null;
  let target: HTMLElement | null = null;
  let hideTimer: number | undefined;
  let frame = 0;

  function ensureButton(): HTMLButtonElement {
    if (button && host?.isConnected) return button;
    host = document.createElement(HOST_TAG);
    host.style.cssText = 'all: initial; position: fixed; z-index: 2147483646; display: none;';
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'V';
    button.title = 'Open Verba: translate, or reply';
    button.setAttribute('aria-label', 'Open Verba');
    // Keep the message box focused, so the popup still finds it.
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      try {
        // In a thread, hand over the email being answered so the popup opens ready to reply to it.
        const replyTo = lastEmailText(target);
        const message = replyTo ? { type: 'verba:open-popup', replyTo } : { type: 'verba:open-popup' };
        chrome.runtime.sendMessage(message, (res?: { ok?: boolean; error?: { message?: string } }) => {
          const failed = chrome.runtime.lastError !== undefined || res?.ok === false;
          if (failed) flash(res?.error?.message ?? 'Click the Verba icon in the toolbar to open Verba.');
        });
      } catch {
        flash('Verba was updated. Refresh this page to use it.');
      }
    });
    root.append(style, button);
    document.documentElement.append(host);
    return button;
  }

  /** The button cannot say why it did nothing, so show the reason for a moment. */
  function flash(message: string): void {
    if (!button) return;
    const label = button;
    label.textContent = '!';
    label.title = message;
    window.setTimeout(() => {
      label.textContent = 'V';
      label.title = 'Open Verba: translate, or reply';
    }, 4000);
  }

  function hide(): void {
    if (host) host.style.display = 'none';
  }

  function place(): void {
    frame = 0;
    if (!target || !target.isConnected || !isActiveHere()) return hide();
    const rect = target.getBoundingClientRect();
    const visible = rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
    if (!visible || rect.width < MIN_WIDTH || rect.height < MIN_HEIGHT) return hide();
    ensureButton();
    if (!host) return;
    const left = Math.min(rect.right, window.innerWidth) - SIZE - MARGIN;
    const top = Math.min(rect.bottom, window.innerHeight) - SIZE - MARGIN;
    host.style.left = `${Math.max(0, left)}px`;
    host.style.top = `${Math.max(0, top)}px`;
    host.style.display = 'block';
  }

  function schedule(): void {
    if (!frame) frame = window.requestAnimationFrame(place);
  }

  document.addEventListener(
    'focusin',
    (event) => {
      const origin = event.composedPath()[0];
      if (!(origin instanceof Element) || composedAncestors(origin).some((el) => el.localName === HOST_TAG)) return;
      const root = editableRoot(origin);
      if (!root) return;
      window.clearTimeout(hideTimer);
      target = root;
      schedule();
    },
    true,
  );
  document.addEventListener(
    'focusout',
    () => {
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => {
        const active = document.activeElement;
        if (!active || !target || !(target === active || target.contains(active))) {
          target = null;
          hide();
        }
      }, HIDE_DELAY_MS);
    },
    true,
  );
  window.addEventListener('scroll', schedule, true);
  window.addEventListener('resize', schedule);
  // Compose windows grow as the user types.
  document.addEventListener('input', schedule, true);
}
