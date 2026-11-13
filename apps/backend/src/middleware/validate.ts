import type { Schema } from '../utils/json';

/**
 * Parses untrusted input. A ZodError propagates to the error handler, which
 * responds with 400 VALIDATION_ERROR and the issue list.
 */
export function parseOrThrow<T>(schema: Schema<T>, value: unknown): T {
  return schema.parse(value);
}
