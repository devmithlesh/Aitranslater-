/** Largest daily limit the server accepts (credits or request quota). */
export const LIMIT_MAX = 100_000;

export type LimitParse = { ok: true; value: number | null } | { ok: false; error: string };

/** Empty = null (unlimited / follow default). Otherwise a whole number in 0..LIMIT_MAX. */
export function parseLimitInput(raw: string): LimitParse {
  const text = raw.trim();
  if (text === '') return { ok: true, value: null };
  if (!/^\d+$/.test(text)) return { ok: false, error: 'Enter a whole number, or leave it empty for unlimited.' };
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value > LIMIT_MAX) {
    return { ok: false, error: `Use a number up to ${LIMIT_MAX.toLocaleString()}.` };
  }
  return { ok: true, value };
}

export function limitToInput(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}
