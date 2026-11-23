const HOSTNAME_PATTERN = /^(localhost|\d{1,3}(\.\d{1,3}){3}|([a-z0-9-]+\.)+[a-z][a-z0-9-]*[a-z0-9])$/;

/** True for http(s) URLs only. */
export function isHttpUrl(value: string): boolean {
  return parseHttpUrl(value) !== null;
}

/** Returns the URL without trailing slashes, or null when it is not an http(s) URL. */
export function parseHttpUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/**
 * Accepts "bank.example.com", "localhost" or an IPv4 address, and also
 * full URLs (their hostname is used). Returns null for anything else.
 */
export function normalizeHostname(input: string): string | null {
  let value = input.trim().toLowerCase();
  if (!value) return null;
  if (value.includes('://')) {
    try {
      value = new URL(value).hostname;
    } catch {
      return null;
    }
  } else {
    value = value.split(/[/?#]/)[0] ?? '';
  }
  value = value.replace(/\.$/, '');
  return HOSTNAME_PATTERN.test(value) ? value : null;
}
