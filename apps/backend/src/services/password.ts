import { randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import type { ScryptOptions } from 'node:crypto';

/**
 * Password hashing with node:crypto scrypt only. Stored form:
 * `scrypt$<N>$<r>$<p>$<saltBase64>$<hashBase64>`. The parameters travel with the hash, so they can be
 * raised later without breaking existing accounts.
 */
const DEFAULT_N = 32768;
const DEFAULT_R = 8;
const DEFAULT_P = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 64;
const MAX_MEMORY = 64 * 1024 * 1024;

/** Bounds on parameters read back from storage, so a corrupt or hostile value cannot exhaust memory. */
const MAX_N = 2 ** 20;
const MAX_R = 32;
const MAX_P = 4;

/** Unambiguous characters for temporary passwords (no I, l, O, 0, 1). */
const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const TEMP_LENGTH = 14;

interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

function deriveKey(password: string, salt: Buffer, params: ScryptParams, keyLength: number): Promise<Buffer> {
  const options: ScryptOptions = { N: params.N, r: params.r, p: params.p, maxmem: MAX_MEMORY };
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const params = { N: DEFAULT_N, r: DEFAULT_R, p: DEFAULT_P };
  const key = await deriveKey(password, salt, params, KEY_BYTES);
  return `scrypt$${params.N}$${params.r}$${params.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

/** Parses a stored hash. Returns undefined for anything malformed or outside the safe bounds. */
function parseStored(stored: string): { params: ScryptParams; salt: Buffer; hash: Buffer } | undefined {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return undefined;
  const [N, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return undefined;
  if (N < 2 || N > MAX_N || (N & (N - 1)) !== 0) return undefined;
  if (r < 1 || r > MAX_R || p < 1 || p > MAX_P) return undefined;
  const salt = Buffer.from(parts[4], 'base64');
  const hash = Buffer.from(parts[5], 'base64');
  if (salt.length < 8 || hash.length < 16 || hash.length > 128) return undefined;
  return { params: { N, r, p }, salt, hash };
}

/** True only when `password` matches `stored`. Malformed stored values never match. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseStored(stored);
  if (!parsed) return false;
  try {
    const key = await deriveKey(password, parsed.salt, parsed.params, parsed.hash.length);
    return timingSafeEqual(key, parsed.hash);
  } catch {
    return false;
  }
}

/** A well-formed hash that no password matches. Used so unknown accounts cost the same time as real ones. */
const DUMMY_HASH = `scrypt$${DEFAULT_N}$${DEFAULT_R}$${DEFAULT_P}$${Buffer.alloc(SALT_BYTES, 0x42).toString('base64')}$${Buffer.alloc(KEY_BYTES, 0x17).toString('base64')}`;

/** Runs one scrypt on a fixed hash and discards the result. */
export async function dummyVerify(password: string): Promise<void> {
  await verifyPassword(password, DUMMY_HASH);
}

/** A random password from an unambiguous alphabet, shown once to the admin. */
export function generateTemporaryPassword(): string {
  let out = '';
  for (let i = 0; i < TEMP_LENGTH; i++) out += TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)];
  return out;
}
