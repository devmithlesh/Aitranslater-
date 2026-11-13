import type { ConnectionCode } from './api';

const PREFIX = 'verba_';

function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(input: string): string {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Strip trailing slashes and a trailing "/api" so callers can append "/api/...". */
export function normalizeApiUrl(url: string): string {
  return url.trim().replace(/\/+$/, '').replace(/\/api$/, '');
}

export function encodeConnectionCode(apiUrl: string, token: string): string {
  const payload: ConnectionCode = { v: 1, apiUrl: normalizeApiUrl(apiUrl), token };
  return PREFIX + toBase64Url(JSON.stringify(payload));
}

/** Returns null for anything that is not a well-formed v1 connection code. */
export function decodeConnectionCode(code: string): ConnectionCode | null {
  const trimmed = code.trim();
  if (!trimmed.startsWith(PREFIX)) return null;
  try {
    const parsed = JSON.parse(fromBase64Url(trimmed.slice(PREFIX.length))) as Partial<ConnectionCode>;
    if (parsed.v !== 1 || typeof parsed.apiUrl !== 'string' || typeof parsed.token !== 'string') return null;
    const url = new URL(parsed.apiUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!parsed.token) return null;
    return { v: 1, apiUrl: normalizeApiUrl(parsed.apiUrl), token: parsed.token };
  } catch {
    return null;
  }
}
