import type { ApiErrorCode, CustomAssistant, UserSettings } from '@verba/shared';
import type { ExtensionState, StoredConnection } from '../shared/messages';

/**
 * Every server error code. A Record (not an array) so adding a code to ApiErrorCode without listing it
 * here is a compile error; an unlisted code would otherwise arrive as INTERNAL and break special cards
 * such as CREDIT_LIMIT_REACHED.
 */
const API_ERROR_CODE_SET: Record<ApiErrorCode, true> = {
  VALIDATION_ERROR: true,
  UNAUTHORIZED: true,
  FORBIDDEN: true,
  NOT_FOUND: true,
  CONFLICT: true,
  PAYLOAD_TOO_LARGE: true,
  RATE_LIMITED: true,
  CREDIT_LIMIT_REACHED: true,
  NO_PROVIDER_CONFIGURED: true,
  PROVIDER_ERROR: true,
  PROVIDER_TIMEOUT: true,
  INTERNAL: true,
};
const API_ERROR_CODES = Object.keys(API_ERROR_CODE_SET) as readonly ApiErrorCode[];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && (API_ERROR_CODES as readonly string[]).includes(value);
}

export function isStoredConnection(value: unknown): value is StoredConnection {
  return (
    isRecord(value) &&
    typeof value.apiUrl === 'string' &&
    typeof value.token === 'string' &&
    typeof value.dashboardUrl === 'string' &&
    typeof value.connectedAt === 'string'
  );
}

export function isExtensionState(value: unknown): value is ExtensionState {
  return (
    isRecord(value) &&
    typeof value.connected === 'boolean' &&
    typeof value.dashboardUrl === 'string' &&
    Array.isArray(value.assistants)
  );
}

/** Minimal shape check for backend settings; deeper fields are defaulted by readers. */
export function asUserSettings(value: unknown): UserSettings | null {
  if (!isRecord(value) || typeof value.defaultTargetLang !== 'string' || !isRecord(value.extension)) return null;
  return value as unknown as UserSettings;
}

export function isCustomAssistant(value: unknown): value is CustomAssistant {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.icon === 'string' &&
    typeof value.showInExtension === 'boolean'
  );
}
