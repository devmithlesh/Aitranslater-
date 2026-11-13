import { encodeConnectionCode } from '@verba/shared';

/** A freshly issued connection code. Lives only in component state; never persisted. */
export interface RevealedCode {
  name: string;
  code: string;
  /** True when the server URL is local, so the code only works on this computer. */
  local: boolean;
}

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
