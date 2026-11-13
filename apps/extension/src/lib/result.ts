import type { ExtensionError, ExtensionErrorCode, Result } from '../shared/messages';

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function fail(code: ExtensionErrorCode, message: string, extra?: { status?: number; details?: unknown }): { ok: false; error: ExtensionError } {
  return { ok: false, error: { code, message, ...extra } };
}
