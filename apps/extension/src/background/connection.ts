import { decodeConnectionCode } from '@verba/shared';
import { DEFAULT_DASHBOARD_URL, type ExtensionState, type Result } from '../shared/messages';
import { fail, ok } from '../lib/result';
import { isRecord } from '../lib/guards';
import { cleanApiUrl, cleanDashboardUrl, isLocalHostname, isSafePath, parseHttpUrl } from '../lib/policy';
import { clearConnection, patchState, readState, writeConnection } from '../lib/storage';
import { fetchBackend, hasOriginPermission, originOf } from './backend';
import { sendHeartbeat, syncNow } from './sync';

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

  let dashboardUrl = DEFAULT_DASHBOARD_URL;
  if (req.dashboardUrl !== undefined && req.dashboardUrl.trim() !== '') {
    const cleaned = cleanDashboardUrl(req.dashboardUrl);
    if (!cleaned) return fail('VALIDATION_ERROR', 'Enter a valid dashboard address (http or https).');
    dashboardUrl = cleaned;
  }

  return ok({ apiUrl: apiUrl ?? '', token, dashboardUrl });
}

/** Verifies the server and token, then persists the connection and syncs. */
export async function connectExtension(req: ConnectInput): Promise<Result<ExtensionState>> {
  const input = resolveConnectInput(req);
  if (!input.ok) return { ok: false, error: input.error };
  const { apiUrl, token, dashboardUrl } = input.data;

  const host = parseHttpUrl(apiUrl)?.hostname ?? '';
  if (!isLocalHostname(host) && !(await hasOriginPermission(apiUrl))) {
    return fail('PERMISSION_DENIED', `Verba needs permission to reach ${originOf(apiUrl)}. Open Verba settings and reconnect.`);
  }

  const health = await fetchBackend({ apiUrl }, 'GET', '/health', undefined, { timeoutMs: 10_000 });
  if (!health.ok) return health;
  if (!isRecord(health.data) || health.data.name !== 'verba') {
    return fail('VALIDATION_ERROR', "That address doesn't look like a Verba server.");
  }

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

export async function disconnectExtension(): Promise<Result<ExtensionState>> {
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
