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

/** Hosts Verba's hosted API used to run on. Saved connections pointing there are moved to the current server. */
const RETIRED_API_HOSTS: readonly string[] = ['verba-api-production.up.railway.app'];

/**
 * `savedUrl`, or `currentUrl` when `savedUrl` points at a retired Verba host. The token stays valid:
 * the new server uses the same database and secrets.
 */
export function replaceRetiredApiUrl(savedUrl: string, currentUrl: string): string {
  try {
    if (RETIRED_API_HOSTS.includes(new URL(savedUrl).hostname)) return currentUrl;
  } catch {
    /* not a URL: leave it for the caller's own validation */
  }
  return savedUrl;
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
