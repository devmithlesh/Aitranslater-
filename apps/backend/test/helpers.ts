import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Express } from 'express';
import request from 'supertest';
import { vi } from 'vitest';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config/env';
import { FileStorage } from '../src/storage/file-storage';
import { ensureAdminAccount } from '../src/services/auth.service';
import { parseEncryptionKey } from '../src/utils/crypto';

export const TEST_TOKEN = 'vrb_test_token_0123456789abcdef';
export const TEST_KEY_HEX = '11'.repeat(32);
export const AUTH = { Authorization: `Bearer ${TEST_TOKEN}` };

/** The password a test account chooses after its temporary one (see createUserAccount). */
export const CHOSEN_PASSWORD = 'chosen-password-1';

export interface Harness {
  app: Express;
  storage: FileStorage;
  dir: string;
  close: () => Promise<void>;
}

export interface HarnessOptions {
  /** Pins the server clock (day boundaries, credit resets, session expiry). Defaults to the real clock. */
  now?: () => Date;
}

/**
 * Builds an app over a throwaway data directory. Rate limits are set high so tests never hit them unless a
 * test lowers them on purpose. ADMIN_EMAIL / ADMIN_PASSWORD in `env` seed an admin account, as boot does.
 */
export async function createHarness(env: Record<string, string> = {}, options: HarnessOptions = {}): Promise<Harness> {
  const dir = mkdtempSync(join(tmpdir(), 'verba-test-'));
  const config = loadConfig({
    DATA_DIR: dir,
    VERBA_ACCESS_TOKEN: TEST_TOKEN,
    VERBA_ENCRYPTION_KEY: TEST_KEY_HEX,
    RATE_LIMIT_PER_MINUTE: '10000',
    RATE_LIMIT_AI_PER_MINUTE: '10000',
    AUTH_RATE_LIMIT_PER_15_MIN: '10000',
    ...env,
  });
  const storage = new FileStorage(dir);
  await storage.init();
  await ensureAdminAccount(storage, config, options.now);
  const app = createApp({
    config,
    storage,
    accessToken: TEST_TOKEN,
    encryptionKey: parseEncryptionKey(TEST_KEY_HEX),
    now: options.now,
  });
  return {
    app,
    storage,
    dir,
    close: async () => {
      await storage.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Replaces global fetch. Any URL a test did not expect fails loudly instead of touching the network. */
export function mockFetch(handler: (url: string, init: RequestInit | undefined) => Response | Promise<Response>) {
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    return handler(url, init);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export function unexpectedUrl(url: string): never {
  throw new Error(`Unexpected network call in test: ${url}`);
}

export const as = (token: string) => ({ Authorization: `Bearer ${token}` });

let accountCounter = 0;

/**
 * Creates an account through the admin API, signs in with its temporary password, and chooses
 * CHOSEN_PASSWORD. The returned token is a live session with mustChangePassword cleared.
 */
export async function createUserAccount(
  app: Express,
  body: { name?: string; email?: string; dailyLimit?: number | null } = {},
): Promise<{ id: string; email: string; password: string; token: string }> {
  accountCounter += 1;
  const email = body.email ?? `member${accountCounter}@example.com`;
  const created = await request(app)
    .post('/api/admin/users')
    .set(AUTH)
    .send({ name: 'Test user', ...body, email });
  if (created.status !== 201) throw new Error(`Could not create a test user (HTTP ${created.status}).`);
  const temporaryPassword = created.body.temporaryPassword as string;

  const login = await request(app).post('/api/auth/login').send({ email, password: temporaryPassword });
  if (login.status !== 200) throw new Error(`Could not sign in the test user (HTTP ${login.status}).`);
  const token = login.body.token as string;

  const changed = await request(app)
    .post('/api/auth/change-password')
    .set(as(token))
    .send({ currentPassword: temporaryPassword, newPassword: CHOSEN_PASSWORD });
  if (changed.status !== 204) throw new Error(`Could not change the test password (HTTP ${changed.status}).`);

  return { id: created.body.user.id as string, email, password: CHOSEN_PASSWORD, token };
}
