import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

/** Accepts 64 hex characters or base64/base64url encoding of 32 bytes. */
export function parseEncryptionKey(raw: string): Buffer {
  const value = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(value)) return Buffer.from(value, 'hex');
  if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) {
    const decoded = Buffer.from(value, 'base64');
    if (decoded.length === KEY_BYTES) return decoded;
  }
  throw new Error('Encryption key must be 64 hex characters or base64 encoding of 32 bytes.');
}

/** AES-256-GCM. Output format: `iv.tag.ciphertext` (base64url). */
export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString('base64url')).join('.');
}

export function decryptSecret(payload: string, key: Buffer): string {
  const parts = payload.split('.');
  if (parts.length !== 3) throw new Error('Malformed encrypted value.');
  const [iv, tag, data] = parts.map((part) => Buffer.from(part, 'base64url'));
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

export function sha256Hex(value: string): string {
  return sha256(value).toString('hex');
}

export function generateAccessToken(): string {
  return `vrb_${randomBytes(32).toString('base64url')}`;
}

export function generateEncryptionKey(): string {
  return randomBytes(KEY_BYTES).toString('base64');
}
