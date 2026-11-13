import {
  decodeConnectionCode,
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  type LoginRequest,
} from '@verba/shared';
import { DEFAULT_API_URL, DEFAULT_DASHBOARD_URL, type ExtensionState, type Result } from '../shared/messages';
import { fail, ok } from '../lib/result';
import { isRecord } from '../lib/guards';
import { cleanApiUrl, cleanDashboardUrl, isLocalHostname, isSafePath, parseHttpUrl } from '../lib/policy';
import { clearConnection, patchState, readConnection, readState, writeConnection } from '../lib/storage';
import { fetchBackend, hasOriginPermission, originOf } from './backend';
import { sendHeartbeat, syncNow } from './sync';

const LOGIN_TIMEOUT_MS = 20_000;
const LOGOUT_TIMEOUT_MS = 5_000;

interface ConnectInput {
  code?: string;
  apiUrl?: string;
  token?: string;
  dashboardUrl?: string;
}

interface ResolvedConnect {
  apiUrl: string;
  token: string;
  dashboardUrl: string;
}

export interface LoginInput {
  apiUrl?: string;
  email: string;
  password: string;
  dashboardUrl?: string;
}

/** Optional dashboard address: blank means the default. */
function resolveDashboardUrl(raw: string | undefined): Result<string> {
  if (raw === undefined || raw.trim() === '') return ok(DEFAULT_DASHBOARD_URL);
  const cleaned = cleanDashboardUrl(raw);
  if (!cleaned) return fail('VALIDATION_ERROR', 'Enter a valid dashboard address (http or https).');
  return ok(cleaned);
}

function resolveConnectInput(req: ConnectInput): Result<ResolvedConnect> {
  let apiUrl: string | null;
  let token: string;

  if (req.code !== undefined && req.code.trim() !== '') {
    const decoded = decodeConnectionCode(req.code);
    if (!decoded) {
      return fail('VALIDATION_ERROR', "That connection code isn't valid. Copy a fresh one from the Verba dashboard.");
    }
    apiUrl = decoded.apiUrl;
    token = decoded.token;
  } else {
    apiUrl = cleanApiUrl(req.apiUrl ?? '');
    token = (req.token ?? '').trim();
    if (!apiUrl) return fail('VALIDATION_ERROR', 'Enter your Verba server address (http or https).');
    if (!token) return fail('VALIDATION_ERROR', 'Paste your access token.');
  }

  const dashboard = resolveDashboardUrl(req.dashboardUrl);
  if (!dashboard.ok) return { ok: false, error: dashboard.error };

  return ok({ apiUrl: apiUrl ?? '', token, dashboardUrl: dashboard.data });
}

/**
 * Checks that the address is reachable with permission and is a Verba server.
 * Runs before any credential is sent to it.
 */
async function checkServer(apiUrl: string): Promise<Result<null>> {
  const host = parseHttpUrl(apiUrl)?.hostname ?? '';
  if (!isLocalHostname(host) && !(await hasOriginPermission(apiUrl))) {
    return fail('PERMISSION_DENIED', `Verba needs permission to reach ${originOf(apiUrl)}. Open Verba settings and reconnect.`);
  }

  const health = await fetchBackend({ apiUrl }, 'GET', '/health', undefined, { timeoutMs: 10_000 });
  if (!health.ok) return health;
  if (!isRecord(health.data) || health.data.name !== 'verba') {
    return fail('VALIDATION_ERROR', "That address doesn't look like a Verba server.");
  }
  return ok(null);
}

/**
 * The one save step for every sign-in method: verifies the token, persists the
 * connection, and syncs. Callers must have checked the server first.
 */
export async function saveConnection(apiUrl: string, token: string, dashboardUrl: string): Promise<Result<ExtensionState>> {
  const verify = await fetchBackend({ apiUrl, token }, 'GET', '/auth/verify');
  if (!verify.ok) {
    if (verify.error.status === 401) {
      return fail('UNAUTHORIZED', 'Verba rejected this token. Create a new connection code in the dashboard.', { status: 401 });
    }
    return verify;
  }

  await writeConnection({ apiUrl, token, dashboardUrl, connectedAt: new Date().toISOString() });
  await patchState({
    connected: true,
    apiUrl,
    dashboardUrl,
    lastError: null,
    lastSyncAt: null,
    settings: null,
    assistants: [],
  });

  await syncNow();
  await sendHeartbeat();
  return ok(await readState());
}

/** Verifies the server and token, then persists the connection and syncs. */
export async function connectExtension(req: ConnectInput): Promise<Result<ExtensionState>> {
  const input = resolveConnectInput(req);
  if (!input.ok) return { ok: false, error: input.error };
  const { apiUrl, token, dashboardUrl } = input.data;

  const server = await checkServer(apiUrl);
  if (!server.ok) return server;
  return saveConnection(apiUrl, token, dashboardUrl);
}

/** Reads `{ token, me.mustChangePassword }` from an AuthSessionResponse, or null when malformed. */
function readSession(data: unknown): { token: string; mustChangePassword: boolean } | null {
  if (!isRecord(data) || typeof data.token !== 'string' || data.token === '' || !isRecord(data.me)) return null;
  return { token: data.token, mustChangePassword: data.me.mustChangePassword === true };
}

/**
 * Email + password sign-in. The password is sent once to POST /auth/login and is
 * never stored or logged. Only the returned session token is saved.
 */
export async function loginExtension(req: LoginInput): Promise<Result<ExtensionState>> {
  const email = req.email.trim();
  if (email === '' || email.length > EMAIL_MAX_LENGTH) return fail('VALIDATION_ERROR', 'Enter your email address.');
  if (req.password === '' || req.password.length > PASSWORD_MAX_LENGTH) {
    return fail('VALIDATION_ERROR', 'Enter your password.');
  }

  const apiUrl = cleanApiUrl(req.apiUrl?.trim() ? req.apiUrl : DEFAULT_API_URL);
  if (!apiUrl) return fail('VALIDATION_ERROR', 'Enter your Verba server address (http or https).');

  const dashboard = resolveDashboardUrl(req.dashboardUrl);
  if (!dashboard.ok) return { ok: false, error: dashboard.error };

  const server = await checkServer(apiUrl);
  if (!server.ok) return server;

  const body: LoginRequest = { email, password: req.password };
  const login = await fetchBackend({ apiUrl }, 'POST', '/auth/login', body, { timeoutMs: LOGIN_TIMEOUT_MS });
  if (!login.ok) return login;

  const session = readSession(login.data);
  if (!session) return fail('INTERNAL', 'Verba returned an unexpected sign-in response.');
  if (session.mustChangePassword) {
    // The session was minted but not kept: end it and ask the user to finish on the website.
    await endServerSession(apiUrl, session.token);
    return fail('PASSWORD_RESET_REQUIRED', 'Your admin reset your password. Set a new one on the website first.');
  }

  const saved = await saveConnection(apiUrl, session.token, dashboard.data);
  if (!saved.ok) await endServerSession(apiUrl, session.token);
  return saved;
}

/** Best effort: ends the server session. Never throws, so local sign-out always completes. */
async function endServerSession(apiUrl: string, token: string): Promise<void> {
  try {
    await fetchBackend({ apiUrl, token }, 'POST', '/auth/logout', undefined, { timeoutMs: LOGOUT_TIMEOUT_MS });
  } catch {
    // Ignored: the local connection is cleared regardless.
  }
}

export async function disconnectExtension(): Promise<Result<ExtensionState>> {
  const connection = await readConnection();
  if (connection) await endServerSession(connection.apiUrl, connection.token);

  await clearConnection();
  const state = await patchState({
    connected: false,
    apiUrl: null,
    lastSyncAt: null,
    lastError: null,
    settings: null,
    assistants: [],
  });
  return ok(state);
}

export async function setDashboardUrl(raw: string): Promise<Result<ExtensionState>> {
  const cleaned = cleanDashboardUrl(raw);
  if (!cleaned) return fail('VALIDATION_ERROR', 'Enter a valid dashboard address (http or https).');
  const state = await patchState({ dashboardUrl: cleaned });
  return ok(state);
}

export async function openDashboard(path: string | undefined): Promise<Result<null>> {
  const target = path ?? '/';
  if (!isSafePath(target)) return fail('VALIDATION_ERROR', 'Invalid dashboard path.');
  const state = await readState();
  try {
    await chrome.tabs.create({ url: `${state.dashboardUrl}${target}` });
    return ok(null);
  } catch {
    return fail('INTERNAL', 'Could not open the dashboard.');
  }
}

export async function openOptions(): Promise<Result<null>> {
  try {
    await chrome.runtime.openOptionsPage();
    return ok(null);
  } catch {
    return fail('INTERNAL', 'Could not open Verba settings.');
  }
}
