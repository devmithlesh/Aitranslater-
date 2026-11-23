import { replaceRetiredApiUrl } from '@verba/shared';
import { DEFAULT_API_URL, DEFAULT_DASHBOARD_URL, STORAGE_KEYS, type ExtensionState, type StoredConnection } from '../shared/messages';
import { isExtensionState, isStoredConnection } from './guards';

function emptyState(): ExtensionState {
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
  if (!isStoredConnection(value)) return null;
  const apiUrl = replaceRetiredApiUrl(value.apiUrl, DEFAULT_API_URL);
  return apiUrl === value.apiUrl ? value : { ...value, apiUrl };
}

/** A random id for this install, made once. The server counts a signed-out visitor's free prompts under it. */
let guestIdPending: Promise<string> | null = null;
export function readGuestId(): Promise<string> {
  // Several popup views ask at once on first open: they must all get the same id.
  guestIdPending ??= loadGuestId().catch((err: unknown) => {
    guestIdPending = null;
    throw err;
  });
  return guestIdPending;
}

async function loadGuestId(): Promise<string> {
  const raw = await chrome.storage.local.get(STORAGE_KEYS.guestId);
  const value: unknown = raw[STORAGE_KEYS.guestId];
  if (typeof value === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(value)) return value;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ [STORAGE_KEYS.guestId]: id });
  return id;
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
  if (!isExtensionState(value)) return emptyState();
  const apiUrl = value.apiUrl === null ? null : replaceRetiredApiUrl(value.apiUrl, DEFAULT_API_URL);
  return apiUrl === value.apiUrl ? value : { ...value, apiUrl };
}

/** Read-modify-write of the public state record. Callers are sequential per user action. */
export async function patchState(patch: Partial<ExtensionState>): Promise<ExtensionState> {
  const next: ExtensionState = { ...(await readState()), ...patch };
  await chrome.storage.local.set({ [STORAGE_KEYS.state]: next });
  return next;
}
