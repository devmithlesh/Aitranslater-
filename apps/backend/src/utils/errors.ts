import type { ApiErrorCode } from '@verba/shared';

/** Error with an HTTP status and a contract error code, rendered by the error handler. */
export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(code: ApiErrorCode, status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown): AppError =>
  new AppError('VALIDATION_ERROR', 400, message, details);

export const notFound = (message: string): AppError => new AppError('NOT_FOUND', 404, message);

export const unauthorized = (message = 'Missing or invalid access token.'): AppError =>
  new AppError('UNAUTHORIZED', 401, message);

export const forbidden = (message: string): AppError => new AppError('FORBIDDEN', 403, message);

export const conflict = (message: string): AppError => new AppError('CONFLICT', 409, message);

export const notConfigured = (message: string): AppError =>
  new AppError('NO_PROVIDER_CONFIGURED', 503, message);

export const providerFailed = (message: string, details?: unknown): AppError =>
  new AppError('PROVIDER_ERROR', 502, message, details);

export const providerTimeout = (message: string, details?: unknown): AppError =>
  new AppError('PROVIDER_TIMEOUT', 504, message, details);

export function describeError(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Unknown error';
}
