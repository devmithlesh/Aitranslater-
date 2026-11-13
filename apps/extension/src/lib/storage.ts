import { DEFAULT_DASHBOARD_URL, STORAGE_KEYS, type ExtensionState, type StoredConnection } from '../shared/messages';
import { isExtensionState, isStoredConnection } from './guards';

export function emptyState(): ExtensionState {
  return {
    connected: false,
    apiUrl: null,
    dashboardUrl: DEFAULT_DASHBOARD_URL,
    lastSyncAt: null,
    lastError: null,
    settings: null,
    assistants: [],
  };
}

/** The access token lives only here; it is never copied into ExtensionState. */
export async function readConnection(): Promise<StoredConnection | null> {
  const raw = await chrome.storage.local.get(STORAGE_KEYS.connection);
  const value: unknown = raw[STORAGE_KEYS.connection];
  return isStoredConnection(value) ? value : null;
}

export async function writeConnection(connection: StoredConnection): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.connection]: connection });
}

export async function clearConnection(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.connection);
}

export async function readState(): Promise<ExtensionState> {
  const raw = await chrome.storage.local.get(STORAGE_KEYS.state);
  const value: unknown = raw[STORAGE_KEYS.state];
  return isExtensionState(value) ? value : emptyState();
}

/** Read-modify-write of the public state record. Callers are sequential per user action. */
export async function patchState(patch: Partial<ExtensionState>): Promise<ExtensionState> {
  const next: ExtensionState = { ...(await readState()), ...patch };
  await chrome.storage.local.set({ [STORAGE_KEYS.state]: next });
  return next;
}
