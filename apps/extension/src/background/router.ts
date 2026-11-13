import type { BackgroundRequest } from '../shared/messages';
import { fail, ok } from '../lib/result';
import { classifySender, isHttpMethod, isRequestAllowed } from '../lib/policy';
import { isRecord } from '../lib/guards';
import { readState } from '../lib/storage';
import { callBackend } from './backend';
import {
  connectExtension,
  disconnectExtension,
  openDashboard,
  openOptions,
  setDashboardUrl,
} from './connection';
import { syncNow } from './sync';

function optString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Validates an untrusted runtime message into a typed request, or null. */
export function parseRequest(value: unknown): BackgroundRequest | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null;
  switch (value.type) {
    case 'verba:api':
      return isHttpMethod(value.method) && typeof value.path === 'string'
        ? { type: 'verba:api', method: value.method, path: value.path, body: value.body }
        : null;
    case 'verba:get-state':
      return { type: 'verba:get-state' };
    case 'verba:connect':
      return {
        type: 'verba:connect',
        code: optString(value.code),
        apiUrl: optString(value.apiUrl),
        token: optString(value.token),
        dashboardUrl: optString(value.dashboardUrl),
      };
    case 'verba:disconnect':
      return { type: 'verba:disconnect' };
    case 'verba:sync':
      return { type: 'verba:sync' };
    case 'verba:set-dashboard-url':
      return typeof value.dashboardUrl === 'string' ? { type: 'verba:set-dashboard-url', dashboardUrl: value.dashboardUrl } : null;
    case 'verba:open-dashboard':
      return { type: 'verba:open-dashboard', path: optString(value.path) };
    case 'verba:open-options':
      return { type: 'verba:open-options' };
    default:
      return null;
  }
}

async function dispatch(request: BackgroundRequest): Promise<unknown> {
  switch (request.type) {
    case 'verba:api':
      return callBackend(request.method, request.path, request.body);
    case 'verba:get-state':
      return ok(await readState());
    case 'verba:connect':
      return connectExtension(request);
    case 'verba:disconnect':
      return disconnectExtension();
    case 'verba:sync':
      return syncNow();
    case 'verba:set-dashboard-url':
      return setDashboardUrl(request.dashboardUrl);
    case 'verba:open-dashboard':
      return openDashboard(request.path);
    case 'verba:open-options':
      return openOptions();
  }
}

/** Entry point for every runtime message. Always resolves with a Result. */
export async function handleRequest(message: unknown, sender: chrome.runtime.MessageSender): Promise<unknown> {
  try {
    const trust = classifySender(sender, chrome.runtime.id, chrome.runtime.getURL(''));
    if (trust === 'untrusted') return fail('FORBIDDEN_PATH', 'This sender is not allowed to use Verba.');

    const request = parseRequest(message);
    if (!request) return fail('VALIDATION_ERROR', 'Unknown Verba request.');
    if (!isRequestAllowed(trust, request)) {
      return fail('FORBIDDEN_PATH', 'This request is not allowed from this page.');
    }
    return await dispatch(request);
  } catch (err) {
    console.warn('Verba: request failed', err instanceof Error ? err.name : 'unknown');
    return fail('INTERNAL', 'Something went wrong in Verba. Try again.');
  }
}
