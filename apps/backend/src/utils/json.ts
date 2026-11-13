import type { ZodType, ZodTypeDef } from 'zod';

/** A zod schema whose input is unknown (parsing untrusted data). */
export type Schema<T> = ZodType<T, ZodTypeDef, unknown>;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Pulls the outermost JSON object out of model output. Tolerates Markdown
 * fences and chatter before or after the object.
 */
export function extractJsonObject(raw: string): unknown {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('No JSON object found in model output.');
  return JSON.parse(raw.slice(start, end + 1)) as unknown;
}

export function parseLlmJson<T>(raw: string, schema: Schema<T>): T {
  return schema.parse(extractJsonObject(raw));
}
