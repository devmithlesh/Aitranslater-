import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { normalizeApiUrl, replaceRetiredApiUrl } from '@verba/shared';

const STORAGE_KEY = 'verba.connection';
export const DEFAULT_API_URL = normalizeApiUrl(import.meta.env.VITE_API_URL ?? 'http://localhost:8787');

export interface ConnectionState {
  apiUrl: string;
  token: string | null;
  /** Set when the backend rejects the stored token, so the app can route to /connect. */
  unauthorized: boolean;
}

function load(): ConnectionState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ConnectionState>;
      // A saved server URL only matters together with a token. Signed out, always use this build's
      // server (VITE_API_URL), so a stale saved URL (e.g. localhost from an earlier build) can't break login.
      if (typeof parsed.apiUrl === 'string' && typeof parsed.token === 'string' && parsed.token) {
        return { apiUrl: replaceRetiredApiUrl(parsed.apiUrl, DEFAULT_API_URL), token: parsed.token, unauthorized: false };
      }
    }
  } catch {
    /* storage unavailable or corrupt — fall back to defaults */
  }
  return { apiUrl: DEFAULT_API_URL, token: null, unauthorized: false };
}

export function persistConnection(state: ConnectionState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ apiUrl: state.apiUrl, token: state.token }));
  } catch {
    /* ignore */
  }
}

const connectionSlice = createSlice({
  name: 'connection',
  initialState: load,
  reducers: {
    connected(state, action: PayloadAction<{ apiUrl: string; token: string }>) {
      state.apiUrl = normalizeApiUrl(action.payload.apiUrl);
      state.token = action.payload.token;
      state.unauthorized = false;
    },
    disconnected(state) {
      state.token = null;
      state.unauthorized = false;
      // Back to this build's server, so the login page never talks to a previous custom/stale URL.
      state.apiUrl = DEFAULT_API_URL;
    },
    tokenRejected(state) {
      state.unauthorized = true;
    },
  },
});

export const { connected, disconnected, tokenRejected } = connectionSlice.actions;
export default connectionSlice.reducer;
