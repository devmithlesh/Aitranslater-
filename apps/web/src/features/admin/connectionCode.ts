import { encodeConnectionCode } from '@verba/shared';

/** Turns a one-time token into the code the user pastes into the app. */
export function buildConnectionCode(apiUrl: string, token: string): string {
  return encodeConnectionCode(apiUrl, token);
}

export function isLocalServerUrl(apiUrl: string): boolean {
  try {
    const host = new URL(apiUrl).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  } catch {
    return false;
  }
}
