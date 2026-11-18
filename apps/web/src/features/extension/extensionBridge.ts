/** Talks to the Verba Chrome extension from the website via chrome.runtime.sendMessage. */

const NOT_FOUND_MESSAGE = 'Verba extension not found in this browser. Install or enable it, then try again.';
const TIMEOUT_MESSAGE = "The Verba extension didn't respond. Reload the extension and try again.";
const UNEXPECTED_MESSAGE = 'The Verba extension sent an unexpected reply. Update the extension and try again.';

/** Chrome extension IDs are 32 characters from the a-p alphabet. */
const EXTENSION_ID_PATTERN = /^[a-p]{32}$/;

/** Minimal slice of the chrome.runtime API used here, so @types/chrome is not needed. */
interface ChromeRuntime {
  sendMessage?: (extensionId: string, message: object, callback: (response: unknown) => void) => unknown;
  lastError?: { message?: string } | null;
}

export type ExtensionReply<T> = { ok: true; data: T } | { ok: false; message: string };

export function isExtensionId(value: string | null): value is string {
  return value !== null && EXTENSION_ID_PATTERN.test(value);
}

/**
 * Sends a message to the extension and resolves with its reply. Never rejects: a missing extension,
 * a runtime error, a timeout and a malformed reply all become `{ ok: false, message }`.
 */
export function sendToExtension<T>(
  extId: string,
  message: object,
  timeoutMs = 10_000,
): Promise<ExtensionReply<T>> {
  return new Promise((resolve) => {
    const runtime = (globalThis as { chrome?: { runtime?: ChromeRuntime } }).chrome?.runtime;
    if (typeof runtime?.sendMessage !== 'function') {
      resolve({ ok: false, message: NOT_FOUND_MESSAGE });
      return;
    }

    let settled = false;
    const timer = setTimeout(() => finish({ ok: false, message: TIMEOUT_MESSAGE }), timeoutMs);

    function finish(result: ExtensionReply<T>) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    }

    try {
      runtime.sendMessage(extId, message, (response) => {
        // Reading lastError also stops Chrome from logging it as unchecked.
        if (runtime.lastError) {
          finish({ ok: false, message: NOT_FOUND_MESSAGE });
          return;
        }
        finish(parseReply<T>(response));
      });
    } catch {
      // Some Chrome versions throw synchronously for unknown extension IDs.
      finish({ ok: false, message: NOT_FOUND_MESSAGE });
    }
  });
}

function parseReply<T>(response: unknown): ExtensionReply<T> {
  if (!response || typeof response !== 'object' || typeof (response as { ok?: unknown }).ok !== 'boolean') {
    return { ok: false, message: UNEXPECTED_MESSAGE };
  }
  const reply = response as { ok: boolean; data?: unknown; error?: { message?: unknown } };
  if (reply.ok) return { ok: true, data: reply.data as T };
  const message = typeof reply.error?.message === 'string' ? reply.error.message : UNEXPECTED_MESSAGE;
  return { ok: false, message };
}
