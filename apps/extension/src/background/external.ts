/**
 * Messages from the Verba website (chrome.runtime.onMessageExternal). The website can only reach
 * this module from its own origin, in its top frame, and every request is validated here. It never
 * goes through the extension-only router, so the internal API stays closed to web pages.
 */
import { fail, ok } from '../lib/result';
import { isRecord } from '../lib/guards';
import { readState } from '../lib/storage';
import { connectFromWebsite } from './connection';

const MAX_API_URL_LENGTH = 2048;
const MAX_TOKEN_LENGTH = 4096;

/** Origin of a sender, from `origin` or, as a fallback, the origin of `url`. Null when unknown. */
function senderOrigin(sender: { origin?: string; url?: string }): string | null {
  if (sender.origin) return sender.origin;
  if (!sender.url) return null;
  try {
    return new URL(sender.url).origin;
  } catch {
    return null;
  }
}

/**
 * True only for a top-frame page whose origin is the configured dashboard origin. Pure, so it can be
 * unit-tested without chrome.* mocks.
 */
export function isTrustedWebSender(
  sender: { origin?: string; url?: string; frameId?: number },
  dashboardUrl: string,
): boolean {
  if (sender.frameId !== 0) return false;
  const origin = senderOrigin(sender);
  if (!origin) return false;
  let dashboardOrigin: string;
  try {
    dashboardOrigin = new URL(dashboardUrl).origin;
  } catch {
    return false;
  }
  return origin === dashboardOrigin;
}

/** Answers one website request. Never throws: failures come back as a Result. */
export async function handleExternalRequest(message: unknown, sender: chrome.runtime.MessageSender): Promise<unknown> {
  try {
    const state = await readState();
    if (!isTrustedWebSender(sender, state.dashboardUrl)) {
      return fail('FORBIDDEN_PATH', 'This website is not allowed to use Verba.');
    }
    if (!isRecord(message)) return fail('VALIDATION_ERROR', 'Unknown Verba request.');

    if (message.type === 'verba:web-ping') {
      return ok({ connected: state.connected });
    }

    if (message.type === 'verba:web-connect') {
      const { apiUrl, token } = message;
      if (typeof apiUrl !== 'string' || apiUrl.length > MAX_API_URL_LENGTH) {
        return fail('VALIDATION_ERROR', 'Enter your Verba server address (http or https).');
      }
      if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
        return fail('VALIDATION_ERROR', 'Verba did not send a valid sign-in token.');
      }
      const result = await connectFromWebsite(apiUrl, token);
      if (!result.ok) return result;
      return ok({ connected: true });
    }

    return fail('VALIDATION_ERROR', 'Unknown Verba request.');
  } catch (err) {
    console.warn('Verba: external request failed', err instanceof Error ? err.name : 'unknown');
    return fail('INTERNAL', 'Verba could not complete that request.');
  }
}
