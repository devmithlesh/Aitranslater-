import type { BackgroundRequest } from '../shared/messages';
import { fail, ok } from '../lib/result';
import { classifySender, isHttpMethod, isRequestAllowed } from '../lib/policy';
import { isRecord } from '../lib/guards';
import { readState } from '../lib/storage';
import {
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@verba/shared';
import { callBackend } from './backend';
import {
  disconnectExtension,
  loginExtension,
  openDashboard,
  openOptions,
  signupExtension,
} from './connection';
import { openPopup } from './launcher';
import { syncNow } from './sync';

function optString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Email (trimmed, 1..EMAIL_MAX_LENGTH) and password (1..PASSWORD_MAX_LENGTH, not trimmed). */
function parseLogin(value: Record<string, unknown>): BackgroundRequest | null {
  if (typeof value.email !== 'string' || typeof value.password !== 'string') return null;
  const email = value.email.trim();
  if (email.length === 0 || email.length > EMAIL_MAX_LENGTH) return null;
  if (value.password.length === 0 || value.password.length > PASSWORD_MAX_LENGTH) return null;
  return {
    type: 'verba:login',
    apiUrl: optString(value.apiUrl),
    email,
    password: value.password,
    dashboardUrl: optString(value.dashboardUrl),
  };
}

/** Name (trimmed, 1..NAME_MAX_LENGTH), email (trimmed, 1..EMAIL_MAX_LENGTH) and password (PASSWORD_MIN_LENGTH..PASSWORD_MAX_LENGTH, not trimmed). */
function parseSignup(value: Record<string, unknown>): BackgroundRequest | null {
  if (typeof value.name !== 'string' || typeof value.email !== 'string' || typeof value.password !== 'string') return null;
  const name = value.name.trim();
  if (name.length === 0 || name.length > NAME_MAX_LENGTH) return null;
  const email = value.email.trim();
  if (email.length === 0 || email.length > EMAIL_MAX_LENGTH) return null;
  if (value.password.length < PASSWORD_MIN_LENGTH || value.password.length > PASSWORD_MAX_LENGTH) return null;
  return {
    type: 'verba:signup',
    apiUrl: optString(value.apiUrl),
    name,
    email,
    password: value.password,
    dashboardUrl: optString(value.dashboardUrl),
  };
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
    case 'verba:login':
      return parseLogin(value);
    case 'verba:signup':
      return parseSignup(value);
    case 'verba:disconnect':
      return { type: 'verba:disconnect' };
    case 'verba:sync':
      return { type: 'verba:sync' };
    case 'verba:open-dashboard':
      return { type: 'verba:open-dashboard', path: optString(value.path) };
    case 'verba:open-options':
      return { type: 'verba:open-options' };
    case 'verba:open-popup':
      return { type: 'verba:open-popup' };
    default:
      return null;
  }
}

async function dispatch(request: BackgroundRequest, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (request.type) {
    case 'verba:api':
      return callBackend(request.method, request.path, request.body);
    case 'verba:get-state':
      return ok(await readState());
    case 'verba:login':
      return loginExtension(request);
    case 'verba:signup':
      return signupExtension(request);
    case 'verba:disconnect':
      return disconnectExtension();
    case 'verba:sync':
      return syncNow();
    case 'verba:open-dashboard':
      return openDashboard(request.path);
    case 'verba:open-options':
      return openOptions();
    case 'verba:open-popup':
      return openPopup(sender);
  }
}

/** Entry point for every runtime message. Always resolves with a Result. */
export async function handleRequest(message: unknown, sender: chrome.runtime.MessageSender): Promise<unknown> {
  try {
    const trust = classifySender(sender, chrome.runtime.id, chrome.runtime.getURL(''));
    if (trust === 'untrusted') return fail('FORBIDDEN_PATH', 'This sender is not allowed to use Verba.');

    const request = parseRequest(message);
    if (!request) {
      // Login gets its own message: the form validates first, so this only happens for malformed input.
      if (isRecord(message) && message.type === 'verba:login') {
        return fail('VALIDATION_ERROR', 'Enter a valid email and password.');
      }
      if (isRecord(message) && message.type === 'verba:signup') {
        return fail('VALIDATION_ERROR', 'Enter your name, a valid email and a password of at least 8 characters.');
      }
      return fail('VALIDATION_ERROR', 'Unknown Verba request.');
    }
    if (!isRequestAllowed(trust, request)) {
      return fail('FORBIDDEN_PATH', 'This request is not allowed from this page.');
    }
    return await dispatch(request, sender);
  } catch (err) {
    console.warn('Verba: request failed', err instanceof Error ? err.name : 'unknown');
    return fail('INTERNAL', 'Something went wrong in Verba. Try again.');
  }
}
