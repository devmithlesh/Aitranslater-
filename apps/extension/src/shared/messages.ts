/**
 * Message contract between extension contexts.
 *
 *   content script ─┐
 *   popup / options ┼──► background service worker ──► Verba backend (fetch)
 *                   │
 *   background ─────┴──► content script  (commands / context-menu actions)
 *
 * Only the background worker talks to the backend and only it reads the
 * access token. Content scripts never see the token.
 */
import {
  normalizeApiUrl,
  type ApiErrorBody,
  type CustomAssistant,
  type UserSettings,
} from '@verba/shared';

// ── Stored state (chrome.storage.local) ─────────────────────────────
export interface StoredConnection {
  apiUrl: string;
  token: string;
  /** Where "Open dashboard" links go. Defaults to DEFAULT_DASHBOARD_URL. */
  dashboardUrl: string;
  connectedAt: string;
}

/** Snapshot the popup/options/content read via `verba:get-state`. Never includes the token. */
export interface ExtensionState {
  connected: boolean;
  apiUrl: string | null;
  dashboardUrl: string;
  /** Last successful backend contact. */
  lastSyncAt: string | null;
  /** Last sync/heartbeat failure, if the most recent attempt failed. */
  lastError: string | null;
  /** Cached copy of the backend settings — lets the extension work while the server is briefly unreachable. */
  settings: UserSettings | null;
  /** Custom assistants flagged showInExtension. */
  assistants: CustomAssistant[];
}

// ── Errors ──────────────────────────────────────────────────────────
export type ExtensionErrorCode =
  | ApiErrorBody['error']['code']
  | 'NOT_CONNECTED' // no connection configured
  | 'NETWORK_ERROR' // backend unreachable
  | 'PERMISSION_DENIED' // host permission for the backend origin missing
  | 'FORBIDDEN_PATH' // content script asked for a non-allow-listed endpoint
  | 'PASSWORD_RESET_REQUIRED'; // admin reset the password: finish on the website first

export interface ExtensionError {
  code: ExtensionErrorCode;
  message: string;
  status?: number;
  details?: unknown;
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: ExtensionError };

// ── Requests to the background worker ───────────────────────────────
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type BackgroundRequest =
  /** Proxy a call to `${apiUrl}/api${path}`. Only extension pages (popup, options) may send it. */
  | { type: 'verba:api'; method: HttpMethod; path: string; body?: unknown }
  | { type: 'verba:get-state' }
  /** Accepts a connection code ("verba_…") or an explicit url+token. Verifies before saving. */
  | { type: 'verba:connect'; code?: string; apiUrl?: string; token?: string; dashboardUrl?: string }
  /** Email + password sign-in. Never stores the password; saves only the session token it returns. */
  | { type: 'verba:login'; apiUrl?: string; email: string; password: string; dashboardUrl?: string }
  /** Ends the server session (best effort) and clears the local connection. */
  | { type: 'verba:disconnect' }
  /** Re-fetch settings + assistants from the backend now. */
  | { type: 'verba:sync' }
  /** Update the dashboard URL without reconnecting. */
  | { type: 'verba:set-dashboard-url'; dashboardUrl: string }
  | { type: 'verba:open-dashboard'; path?: string }
  /** Content scripts cannot call chrome.runtime.openOptionsPage themselves. */
  | { type: 'verba:open-options' };

/** Response type for each request `type`. */
export interface BackgroundResponseMap {
  'verba:api': Result<unknown>;
  'verba:get-state': Result<ExtensionState>;
  'verba:connect': Result<ExtensionState>;
  'verba:login': Result<ExtensionState>;
  'verba:disconnect': Result<ExtensionState>;
  'verba:sync': Result<ExtensionState>;
  'verba:set-dashboard-url': Result<ExtensionState>;
  'verba:open-dashboard': Result<null>;
  'verba:open-options': Result<null>;
}


// ── Typed helpers ───────────────────────────────────────────────────
export function sendToBackground<T extends BackgroundRequest>(
  message: T,
): Promise<BackgroundResponseMap[T['type']]> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response: BackgroundResponseMap[T['type']] | undefined) => {
        const lastError = chrome.runtime.lastError;
        if (lastError || !response) {
          resolve({
            ok: false,
            error: {
              code: 'NETWORK_ERROR',
              // Typically "Extension context invalidated" after an extension reload.
              message: lastError?.message?.includes('context invalidated')
                ? 'Verba was updated. Reload this page to keep using it.'
                : (lastError?.message ?? 'No response from the Verba background worker.'),
            },
          } as BackgroundResponseMap[T['type']]);
          return;
        }
        resolve(response);
      });
    } catch (err) {
      resolve({
        ok: false,
        error: { code: 'NETWORK_ERROR', message: 'Verba was updated. Reload this page to keep using it.', details: String(err) },
      } as BackgroundResponseMap[T['type']]);
    }
  });
}

/** Convenience wrapper for typed API calls through the background worker. */
export async function callApi<T>(method: HttpMethod, path: string, body?: unknown): Promise<Result<T>> {
  return (await sendToBackground({ type: 'verba:api', method, path, body })) as Result<T>;
}

export const STORAGE_KEYS = {
  connection: 'verba.connection',
  state: 'verba.state',
} as const;

/** Build-time URL, falling back to a local value. Trailing slashes are removed. */
function envUrl(raw: string | undefined, fallback: string): string {
  const cleaned = (raw ?? '').trim().replace(/\/+$/, '');
  return cleaned === '' ? fallback : cleaned;
}

/** Default backend base URL (no "/api"). Set VITE_API_URL at build time to change it. */
export const DEFAULT_API_URL = normalizeApiUrl(envUrl(import.meta.env.VITE_API_URL, 'http://localhost:8787'));

/** Default dashboard (website) URL. Set VITE_DASHBOARD_URL at build time to change it. */
export const DEFAULT_DASHBOARD_URL = envUrl(import.meta.env.VITE_DASHBOARD_URL, 'http://localhost:5173');
