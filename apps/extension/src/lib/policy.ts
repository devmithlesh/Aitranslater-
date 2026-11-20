import { normalizeApiUrl } from '@verba/shared';
import type { BackgroundRequest, HttpMethod } from '../shared/messages';

/**
 * Who sent a runtime message. Extension pages (popup, options) may use any safe path. Content scripts may send exactly
 * one request, `verba:open-popup` (the in-page button); the popup reads the page through chrome.scripting.
 * Nothing else is allowed, so a compromised page renderer cannot use the access token.
 */
export type SenderTrust = 'extension' | 'content' | 'untrusted';

const HTTP_METHODS: readonly HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export function isHttpMethod(value: unknown): value is HttpMethod {
  return typeof value === 'string' && (HTTP_METHODS as readonly string[]).includes(value);
}

/** A relative, same-origin path: starts with one "/", no traversal, no encoded separators, no control chars. */
export function isSafePath(path: string): boolean {
  if (typeof path !== 'string' || path.length === 0 || path.length > 512) return false;
  if (!path.startsWith('/') || path.startsWith('//')) return false;
  if (path.includes('..') || path.includes('\\')) return false;
  if (/%2e|%2f|%5c/i.test(path)) return false;
  for (let i = 0; i < path.length; i++) {
    const code = path.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return false; // control characters
  }
  return true;
}

export function classifySender(
  sender: { id?: string; url?: string },
  selfId: string | undefined,
  extensionOrigin: string,
): SenderTrust {
  if (!selfId || sender.id !== selfId) return 'untrusted';
  if (sender.url && sender.url.startsWith(extensionOrigin)) return 'extension';
  return 'content';
}

export function isRequestAllowed(trust: SenderTrust, request: BackgroundRequest): boolean {
  // The in-page Verba button may only ask for the popup; every other request needs an extension page.
  if (trust === 'content') return request.type === 'verba:open-popup';
  if (trust !== 'extension') return false;
  if (request.type === 'verba:api') return isSafePath(request.path);
  if (request.type === 'verba:open-dashboard' && request.path !== undefined) return isSafePath(request.path);
  return true;
}

export function parseHttpUrl(raw: string): URL | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

/** Normalised backend base URL (no trailing slash or "/api"), or null when invalid. */
export function cleanApiUrl(raw: string): string | null {
  const normalized = normalizeApiUrl(raw);
  return parseHttpUrl(normalized) ? normalized : null;
}

/** Dashboard base URL without query/hash or trailing slash, or null when invalid. */
export function cleanDashboardUrl(raw: string): string | null {
  const url = parseHttpUrl(raw);
  if (!url) return null;
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

export function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function isHostDisabled(hostname: string, disabledSites: readonly string[]): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host) return false;
  return disabledSites.some((raw) => {
    const site = raw.trim().toLowerCase();
    return site.length > 0 && (host === site || host.endsWith(`.${site}`));
  });
}
