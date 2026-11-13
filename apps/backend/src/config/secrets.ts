import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { generateAccessToken, generateEncryptionKey, parseEncryptionKey } from '../utils/crypto';
import type { AppConfig } from './env';

const storedSecretsSchema = z.object({
  accessToken: z.string().optional(),
  encryptionKey: z.string().optional(),
});

type StoredSecrets = z.infer<typeof storedSecretsSchema>;

export interface Secrets {
  accessToken: string;
  encryptionKey: Buffer;
  /** True when the token was created on this boot (so the caller can show it once). */
  tokenWasGenerated: boolean;
  secretsPath: string;
}

async function readStoredSecrets(path: string): Promise<StoredSecrets> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    if (isErrnoCode(err, 'ENOENT')) return {};
    throw err;
  }
  const parsed = storedSecretsSchema.safeParse(parseJsonSafely(text));
  if (!parsed.success) {
    throw new Error(`${path} is corrupt. Delete it to regenerate secrets (saved provider keys will become unreadable).`);
  }
  return parsed.data;
}

function parseJsonSafely(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isErrnoCode(err: unknown, code: string): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === code;
}

async function writeStoredSecrets(path: string, secrets: StoredSecrets): Promise<void> {
  await writeFile(path, JSON.stringify(secrets, null, 2), { encoding: 'utf8', mode: 0o600 });
}

/**
 * Resolves the access token and encryption key. Values from the environment win;
 * otherwise they are reused from `${DATA_DIR}/secrets.json` or generated once and persisted.
 */
export async function loadSecrets(config: AppConfig): Promise<Secrets> {
  await mkdir(config.dataDir, { recursive: true });
  const secretsPath = join(config.dataDir, 'secrets.json');
  const stored = await readStoredSecrets(secretsPath);
  let changed = false;

  let tokenWasGenerated = false;
  let accessToken = config.accessToken;
  if (!accessToken) {
    if (stored.accessToken) {
      accessToken = stored.accessToken;
    } else {
      accessToken = generateAccessToken();
      stored.accessToken = accessToken;
      tokenWasGenerated = true;
      changed = true;
    }
  }

  let keyText = config.encryptionKey;
  if (!keyText) {
    if (stored.encryptionKey) {
      keyText = stored.encryptionKey;
    } else {
      keyText = generateEncryptionKey();
      stored.encryptionKey = keyText;
      changed = true;
    }
  }

  if (changed) await writeStoredSecrets(secretsPath, stored);

  return {
    accessToken,
    encryptionKey: parseEncryptionKey(keyText),
    tokenWasGenerated,
    secretsPath,
  };
}
