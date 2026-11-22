import { getProviderDescriptor } from '@verba/shared';
import type { ProviderId } from '@verba/shared';
import { isRecord } from '../utils/json';
import { ProviderError, ProviderTimeoutError } from './types';

export interface HttpOptions {
  timeoutMs: number;
}

export class HttpError extends ProviderError {
  readonly status: number;
  /** Raw response body, for provider-specific retry decisions. Never logged. */
  readonly body: string;

  constructor(provider: ProviderId, status: number, message: string, body: string) {
    super(provider, message, 'failed');
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

export interface HttpRequest {
  provider: ProviderId;
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
  signal: AbortSignal;
  timeoutMs: number;
  /** Secret values to scrub from any error text. */
  redact?: string[];
}

const MAX_DETAIL_CHARS = 200;

/** Statuses that mean "busy or briefly down, try again" rather than "this request is wrong". */
const RETRYABLE_STATUS: ReadonlySet<number> = new Set([429, 500, 502, 503, 504]);
/** Waits before the 2nd and 3rd attempt. Short, so a brief spike is ridden out without a long wait. */
export const RETRY_DELAYS_MS: number[] = [800, 2000];
/** A Retry-After longer than this is not worth waiting for inside one request. */
const MAX_RETRY_AFTER_MS = 4000;

/** True when the status means the provider is busy or briefly unavailable. */
export function isBusyStatus(status: number): boolean {
  return status === 429 || status === 503;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new Error('Request aborted.'));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason instanceof Error ? signal.reason : new Error('Request aborted.'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** Milliseconds from a Retry-After header (seconds), or undefined. */
function retryAfterMs(response: Response): number | undefined {
  const raw = response.headers.get('retry-after');
  const seconds = raw ? Number(raw) : NaN;
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
}

function isNamedError(err: unknown, name: string): boolean {
  return isRecord(err) && err.name === name;
}

function scrub(text: string, secrets: string[]): string {
  return secrets.reduce((acc, secret) => (secret ? acc.split(secret).join('[redacted]') : acc), text);
}

/** Pulls a short human message out of a provider error body, if it has one. */
function providerMessage(body: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(body);
    if (!isRecord(parsed)) return undefined;
    const error = parsed.error;
    if (typeof error === 'string') return error;
    if (isRecord(error) && typeof error.message === 'string') return error.message;
    if (typeof parsed.message === 'string') return parsed.message;
    if (typeof parsed.error_description === 'string') return parsed.error_description;
    return undefined;
  } catch {
    return undefined;
  }
}

function transportError(request: HttpRequest, label: string, err: unknown): Error {
  if (request.signal.aborted) return err instanceof Error ? err : new Error('Request aborted.');
  if (isNamedError(err, 'TimeoutError')) {
    return new ProviderTimeoutError(request.provider, `${label} timed out after ${Math.round(request.timeoutMs / 1000)}s.`);
  }
  const cause = isRecord(err) && isRecord(err.cause) ? err.cause.code : undefined;
  const suffix = typeof cause === 'string' ? ` (${cause})` : '';
  return new ProviderError(request.provider, `${label} could not be reached${suffix}.`);
}

/**
 * JSON request with timeout (combined with the caller's signal) and error mapping.
 * Non-2xx responses become HttpError; the API key never appears in messages.
 */
export async function requestJson(request: HttpRequest): Promise<unknown> {
  const label = getProviderDescriptor(request.provider).name;
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(request.timeoutMs)]);
  const headers: Record<string, string> = { Accept: 'application/json', ...request.headers };
  if (request.body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  let text: string;
  for (let attempt = 0; ; attempt++) {
    try {
      response = await fetch(request.url, {
        method: request.method ?? 'POST',
        headers,
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
        signal,
      });
      text = await response.text();
    } catch (err) {
      throw transportError(request, label, err);
    }
    // A busy or briefly failing provider often answers on the next try (Gemini: "high demand").
    const delay = RETRY_DELAYS_MS[attempt];
    if (response.ok || !RETRYABLE_STATUS.has(response.status) || delay === undefined) break;
    const wait = retryAfterMs(response) ?? delay;
    if (wait > MAX_RETRY_AFTER_MS) break;
    try {
      await sleep(wait, signal);
    } catch (err) {
      throw transportError(request, label, err);
    }
  }

  const redact = request.redact ?? [];
  if (!response.ok) {
    const detail = providerMessage(text);
    const suffix = detail ? `: ${scrub(detail, redact).slice(0, MAX_DETAIL_CHARS)}` : '';
    throw new HttpError(request.provider, response.status, `${label} responded with HTTP ${response.status}${suffix}`, text);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderError(request.provider, `${label} returned a response that is not JSON.`);
  }
}
