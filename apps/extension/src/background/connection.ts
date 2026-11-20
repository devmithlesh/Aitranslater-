import {
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  type LoginRequest,
  type SignupRequest,
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
  apiUrl: string;
  token: string;
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

export interface SignupInput {
  apiUrl?: string;
  name: string;
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
  const apiUrl = cleanApiUrl(req.apiUrl);
  const token = req.token.trim();
  if (!apiUrl) return fail('VALIDATION_ERROR', 'Enter your Verba server address (http or https).');
  if (!token) return fail('VALIDATION_ERROR', 'Paste your access token.');

  const dashboard = resolveDashboardUrl(req.dashboardUrl);
  if (!dashboard.ok) return { ok: false, error: dashboard.error };

  return ok({ apiUrl, token, dashboardUrl: dashboard.data });
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
async function connectExtension(req: ConnectInput): Promise<Result<ExtensionState>> {
  const input = resolveConnectInput(req);
  if (!input.ok) return { ok: false, error: input.error };
  const { apiUrl, token, dashboardUrl } = input.data;

  const server = await checkServer(apiUrl);
  if (!server.ok) return server;
  return saveConnection(apiUrl, token, dashboardUrl);
}

/**
 * Connects using a token the website just issued (external messages). Replaces any previous
 * session, and revokes the new token if it can't be saved.
 */
export async function connectFromWebsite(apiUrl: string, token: string): Promise<Result<ExtensionState>> {
  const old = await readConnection();
  const state = await readState();
  // The website may only hand over a session for our own server (or the one already in use),
  // never point the extension at a new address.
  const requested = cleanApiUrl(apiUrl);
  const allowed = [cleanApiUrl(DEFAULT_API_URL), state.apiUrl ? cleanApiUrl(state.apiUrl) : null];
  if (!requested || !allowed.includes(requested)) {
    return fail('FORBIDDEN_PATH', 'This website tried to connect Verba to a different server.');
  }
  const result = await connectExtension({ apiUrl, token, dashboardUrl: state.dashboardUrl });
  if (!result.ok) {
    const cleaned = cleanApiUrl(apiUrl);
    if (cleaned) await endServerSession(cleaned, token);
    return result;
  }
  if (old && old.token !== token) await endServerSession(old.apiUrl, old.token);
  return result;
}

/** Reads `{ token, me.mustChangePassword }` from an AuthSessionResponse, or null when malformed. */
function readSession(data: unknown): { token: string; mustChangePassword: boolean } | null {
  if (!isRecord(data) || typeof data.token !== 'string' || data.token === '' || !isRecord(data.me)) return null;
  return { token: data.token, mustChangePassword: data.me.mustChangePassword === true };
}

/**
 * Shared tail for every email + password sign-in: reads the returned session, refuses
 * sessions that must change password, then saves the connection (ending the session if saving fails).
 */
async function finishSession(apiUrl: string, data: unknown, dashboardUrl: string): Promise<Result<ExtensionState>> {
  const session = readSession(data);
  if (!session) return fail('INTERNAL', 'Verba returned an unexpected sign-in response.');
  if (session.mustChangePassword) {
    // The session was minted but not kept: end it and ask the user to finish on the website.
    await endServerSession(apiUrl, session.token);
    return fail('PASSWORD_RESET_REQUIRED', 'Your admin reset your password. Set a new one on the website first.');
  }

  const saved = await saveConnection(apiUrl, session.token, dashboardUrl);
  if (!saved.ok) await endServerSession(apiUrl, session.token);
  return saved;
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

  return finishSession(apiUrl, login.data, dashboard.data);
}

/** The nonce Google echoes back inside the ID token, or null when the token is malformed. */
function readIdTokenNonce(idToken: string): string | null {
  const payload = idToken.split('.')[1];
  if (!payload) return null;
  try {
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const parsed: unknown = JSON.parse(atob(padded));
    return isRecord(parsed) && typeof parsed.nonce === 'string' ? parsed.nonce : null;
  } catch {
    return null;
  }
}

/**
 * "Continue with Google". Chrome opens Google's account chooser (chrome.identity), Google returns an ID
 * token for the server's OAuth Web client, and the server trades it for a normal Verba session. The token
 * is checked here for the nonce we sent, then verified again by the server. Nothing from Google is stored.
 */
export async function googleLoginExtension(): Promise<Result<ExtensionState>> {
  const apiUrl = cleanApiUrl(DEFAULT_API_URL);
  if (!apiUrl) return fail('INTERNAL', 'Verba server address is not valid.');
  const dashboard = resolveDashboardUrl(undefined);
  if (!dashboard.ok) return { ok: false, error: dashboard.error };

  const server = await checkServer(apiUrl);
  if (!server.ok) return server;

  const config = await fetchBackend({ apiUrl }, 'GET', '/auth/config', undefined, { timeoutMs: LOGIN_TIMEOUT_MS });
  if (!config.ok) return config;
  const clientId = isRecord(config.data) && typeof config.data.googleClientId === 'string' ? config.data.googleClientId : '';
  if (clientId === '') return fail('INTERNAL', 'Google sign-in is not set up on this server yet. Use your email and password.');

  const nonce = crypto.randomUUID();
  const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  auth.search = new URLSearchParams({
    client_id: clientId,
    response_type: 'id_token',
    redirect_uri: chrome.identity.getRedirectURL(),
    scope: 'openid email profile',
    nonce,
    prompt: 'select_account',
  }).toString();

  let responseUrl: string | undefined;
  try {
    responseUrl = await chrome.identity.launchWebAuthFlow({ url: auth.toString(), interactive: true });
  } catch {
    return fail('INTERNAL', 'Google sign-in was cancelled or could not finish. Try again.');
  }
  const idToken = responseUrl ? new URLSearchParams(new URL(responseUrl).hash.slice(1)).get('id_token') : null;
  if (!idToken || readIdTokenNonce(idToken) !== nonce) return fail('INTERNAL', 'Google sign-in failed. Try again.');

  const login = await fetchBackend({ apiUrl }, 'POST', '/auth/google', { idToken }, { timeoutMs: LOGIN_TIMEOUT_MS });
  if (!login.ok) return login;
  return finishSession(apiUrl, login.data, dashboard.data);
}

/**
 * Account sign-up, then sign-in with the returned session. The password is sent once to
 * POST /auth/signup and is never stored or logged. Only the returned session token is saved.
 */
export async function signupExtension(req: SignupInput): Promise<Result<ExtensionState>> {
  const name = req.name.trim();
  if (name === '' || name.length > NAME_MAX_LENGTH) return fail('VALIDATION_ERROR', 'Enter your name.');

  const email = req.email.trim();
  if (email === '' || email.length > EMAIL_MAX_LENGTH) return fail('VALIDATION_ERROR', 'Enter your email address.');

  if (req.password.length < PASSWORD_MIN_LENGTH) {
    return fail('VALIDATION_ERROR', `Use a password of at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  if (req.password.length > PASSWORD_MAX_LENGTH) {
    return fail('VALIDATION_ERROR', `Use a password of at most ${PASSWORD_MAX_LENGTH} characters.`);
  }

  const apiUrl = cleanApiUrl(req.apiUrl?.trim() ? req.apiUrl : DEFAULT_API_URL);
  if (!apiUrl) return fail('VALIDATION_ERROR', 'Enter your Verba server address (http or https).');

  const dashboard = resolveDashboardUrl(req.dashboardUrl);
  if (!dashboard.ok) return { ok: false, error: dashboard.error };

  const server = await checkServer(apiUrl);
  if (!server.ok) return server;

  const body: SignupRequest = { name, email, password: req.password };
  const signup = await fetchBackend({ apiUrl }, 'POST', '/auth/signup', body, { timeoutMs: LOGIN_TIMEOUT_MS });
  if (!signup.ok) return signup;

  return finishSession(apiUrl, signup.data, dashboard.data);
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
