import { DEFAULT_API_URL, type ExtensionError, type Result } from '../shared/messages';
import { fail, ok } from '../lib/result';
import { isApiErrorCode, isRecord } from '../lib/guards';
import { cleanApiUrl, isLocalHostname, parseHttpUrl } from '../lib/policy';
import { patchState, readConnection, readGuestId } from '../lib/storage';
import type { HttpMethod } from '../shared/messages';

const REQUEST_TIMEOUT_MS = 45_000;

export interface BackendTarget {
  apiUrl: string;
  token?: string;
  /** Install id for a signed-out visitor. Sent instead of a token. */
  guestId?: string;
}

export function originOf(apiUrl: string): string {
  return parseHttpUrl(apiUrl)?.origin ?? apiUrl;
}

export async function hasOriginPermission(apiUrl: string): Promise<boolean> {
  const url = parseHttpUrl(apiUrl);
  if (!url) return false;
  if (isLocalHostname(url.hostname)) return true;
  try {
    return await chrome.permissions.contains({ origins: [`${url.origin}/*`] });
  } catch {
    return false;
  }
}

function isTimeout(err: unknown): boolean {
  return err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError');
}

async function networkFailure(apiUrl: string, err: unknown): Promise<Result<unknown>> {
  if (isTimeout(err)) {
    return fail('NETWORK_ERROR', 'Verba took too long to respond. Try again.');
  }
  const origin = originOf(apiUrl);
  if (!(await hasOriginPermission(apiUrl))) {
    return fail('PERMISSION_DENIED', `Verba needs permission to reach ${origin}. Open Verba settings and reconnect.`);
  }
  return fail('NETWORK_ERROR', `Can't reach your Verba server at ${origin}.`);
}

function codeForStatus(status: number): ExtensionError['code'] {
  switch (status) {
    case 400:
      return 'VALIDATION_ERROR';
    case 401:
      return 'UNAUTHORIZED';
    case 404:
      return 'NOT_FOUND';
    case 413:
      return 'PAYLOAD_TOO_LARGE';
    case 429:
      return 'RATE_LIMITED';
    case 502:
      return 'PROVIDER_ERROR';
    case 503:
      return 'NO_PROVIDER_CONFIGURED';
    case 504:
      return 'PROVIDER_TIMEOUT';
    default:
      return 'INTERNAL';
  }
}

/** Maps the backend `{ error: { code, message, details } }` body to an ExtensionError. */
function toApiError(status: number, payload: unknown): ExtensionError {
  const body = isRecord(payload) && isRecord(payload.error) ? payload.error : null;
  const code = body && isApiErrorCode(body.code) ? body.code : codeForStatus(status);
  const message = body && typeof body.message === 'string' ? body.message : `Verba returned an error (${status}).`;
  return { code, message, status, details: body?.details };
}

/** Low-level call to `${apiUrl}/api${path}`. Does not read storage; callers pass the target. */
export async function fetchBackend(
  target: BackendTarget,
  method: HttpMethod,
  path: string,
  body?: unknown,
  opts?: { timeoutMs?: number },
): Promise<Result<unknown>> {
  const headers: Record<string, string> = { 'X-Verba-Client': 'extension', Accept: 'application/json' };
  if (target.token) headers.Authorization = `Bearer ${target.token}`;
  else if (target.guestId) headers['X-Verba-Guest'] = target.guestId;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`${target.apiUrl}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(opts?.timeoutMs ?? REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    return networkFailure(target.apiUrl, err);
  }

  if (response.status === 204) return ok(null);

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    return { ok: false, error: toApiError(response.status, payload) };
  }
  return ok(payload);
}

/** The only calls a signed-out visitor may make. Each prompt uses one of the few free ones per day. */
const GUEST_CALLS: ReadonlySet<string> = new Set(['POST /translate-variants', 'POST /write', 'POST /reply-variants']);

/** Signed-out use: the free daily prompts. "GET /me" is answered with the visitor's remaining prompts. */
async function callAsGuest(method: HttpMethod, path: string, body?: unknown): Promise<Result<unknown>> {
  const wantsCredits = method === 'GET' && path === '/me';
  if (!wantsCredits && !GUEST_CALLS.has(`${method} ${path}`)) {
    return fail('NOT_CONNECTED', 'Sign in to Verba to use this.');
  }
  const apiUrl = cleanApiUrl(DEFAULT_API_URL);
  if (!apiUrl) return fail('NOT_CONNECTED', 'Verba server address is not valid.');
  const guestId = await readGuestId();
  return fetchBackend({ apiUrl, guestId }, method, wantsCredits ? '/guest/credits' : path, body);
}

/** Calls the saved connection. Marks the state when the token is rejected. Without a connection: guest mode. */
export async function callBackend(method: HttpMethod, path: string, body?: unknown): Promise<Result<unknown>> {
  const connection = await readConnection();
  if (!connection) return callAsGuest(method, path, body);
  const result = await fetchBackend({ apiUrl: connection.apiUrl, token: connection.token }, method, path, body);
  if (!result.ok && result.error.status === 401) {
    await patchState({ lastError: 'Verba rejected the saved token. Reconnect with a new connection code.' });
  }
  return result;
}
