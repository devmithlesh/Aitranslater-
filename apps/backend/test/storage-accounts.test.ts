import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_SETTINGS, type HistoryItem } from '@verba/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileStorage } from '../src/storage/file-storage';
import type { CreditLedger, StoredAppConfig, StoredSession, StoredUser } from '../src/storage/types';

const CREATED = '2026-01-01T00:00:00.000Z';

function makeUser(overrides: Partial<StoredUser> = {}): StoredUser {
  return {
    id: 'user-a',
    name: 'Alice',
    email: 'alice@example.com',
    passwordHash: 'scrypt$16384$8$1$c2FsdA$aGFzaA',
    googleSub: null,
    role: 'user',
    plan: 'free',
    mustChangePassword: false,
    disabled: false,
    dailyLimit: null,
    createdAt: CREATED,
    lastUsedAt: null,
    ...overrides,
  };
}

function makeSession(overrides: Partial<StoredSession> = {}): StoredSession {
  return {
    id: 'session-1',
    userId: 'user-a',
    tokenHash: 'a'.repeat(64),
    createdAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-02-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeHistoryItem(id: string, createdAt: string): HistoryItem {
  return {
    id,
    type: 'translate',
    input: `input ${id}`,
    output: `output ${id}`,
    meta: { provider: 'gemini' },
    client: 'web',
    favorite: false,
    createdAt,
  } as HistoryItem;
}

describe('FileStorage accounts, sessions, config and credits', () => {
  let dir: string;
  let storage: FileStorage;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'verba-accounts-'));
    storage = new FileStorage(dir);
    await storage.init();
  });

  afterEach(async () => {
    await storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('saves, gets and lists users with every account field', async () => {
    expect(await storage.listUsers()).toEqual([]);
    expect(await storage.getUser('user-a')).toBeUndefined();

    const googleLinked = makeUser({
      id: 'user-b',
      name: 'Bob',
      email: 'bob@example.com',
      passwordHash: null,
      googleSub: 'google-sub-bob',
      role: 'admin',
      plan: 'unlimited',
      mustChangePassword: true,
      disabled: true,
      dailyLimit: 7,
      lastUsedAt: '2026-01-02T00:00:00.000Z',
    });
    await storage.saveUser(makeUser());
    await storage.saveUser(googleLinked);

    expect(await storage.getUser('user-a')).toEqual(makeUser());
    expect(await storage.getUser('user-b')).toEqual(googleLinked);
    expect((await storage.listUsers()).map((user) => user.id)).toEqual(['user-a', 'user-b']);

    // saveUser replaces by id.
    await storage.saveUser(makeUser({ disabled: true, dailyLimit: 5, mustChangePassword: true }));
    expect(await storage.getUser('user-a')).toMatchObject({ disabled: true, dailyLimit: 5, mustChangePassword: true });
    expect(await storage.listUsers()).toHaveLength(2);
  });

  it('finds users by exact email (hit and miss)', async () => {
    await storage.saveUser(makeUser());

    expect((await storage.findUserByEmail('alice@example.com'))?.id).toBe('user-a');
    expect(await storage.findUserByEmail('alice@example.co')).toBeUndefined();
    expect(await storage.findUserByEmail('Alice@example.com')).toBeUndefined();
    expect(await storage.findUserByEmail('')).toBeUndefined();
  });

  it('finds users by Google sub (hit and miss) and never matches accounts with a null googleSub', async () => {
    await storage.saveUser(makeUser({ googleSub: 'google-sub-a' }));
    await storage.saveUser(makeUser({ id: 'user-b', email: 'bob@example.com', googleSub: null }));

    expect((await storage.findUserByGoogleSub('google-sub-a'))?.id).toBe('user-a');
    expect(await storage.findUserByGoogleSub('google-sub-z')).toBeUndefined();
    expect(await storage.findUserByGoogleSub('')).toBeUndefined();
    expect(await storage.findUserByGoogleSub('null')).toBeUndefined();
  });

  it('returns copies, so callers cannot mutate stored users', async () => {
    await storage.saveUser(makeUser());
    const copy = await storage.getUser('user-a');
    if (copy) copy.name = 'Changed';
    expect((await storage.getUser('user-a'))?.name).toBe('Alice');
  });

  it('deleteUser removes the user, its sessions and every record stored under that id', async () => {
    await storage.saveUser(makeUser());
    await storage.saveUser(makeUser({ id: 'user-b', email: 'bob@example.com' }));
    const settings = { ...DEFAULT_SETTINGS, updatedAt: CREATED };
    await storage.saveSettings('user-a', settings);
    await storage.insertHistory('user-a', makeHistoryItem('h1', CREATED));
    await storage.saveCredits('user-a', { daily: { '2026-01-01': 3 }, total: 3 });
    await storage.saveSession(makeSession({ id: 's-a1', userId: 'user-a', tokenHash: 'a'.repeat(64) }));
    await storage.saveSession(makeSession({ id: 's-a2', userId: 'user-a', tokenHash: 'c'.repeat(64) }));
    await storage.saveSettings('user-b', settings);
    await storage.saveCredits('user-b', { daily: { '2026-01-01': 1 }, total: 1 });
    await storage.saveSession(makeSession({ id: 's-b1', userId: 'user-b', tokenHash: 'b'.repeat(64) }));

    expect(await storage.deleteUser('user-a')).toBe(true);

    expect(await storage.getUser('user-a')).toBeUndefined();
    expect(await storage.getSettings('user-a')).toBeUndefined();
    expect((await storage.queryHistory('user-a', { offset: 0, limit: 10 })).total).toBe(0);
    expect(await storage.getCredits('user-a')).toBeUndefined();
    expect(await storage.findSessionByTokenHash('a'.repeat(64))).toBeUndefined();
    expect(await storage.findSessionByTokenHash('c'.repeat(64))).toBeUndefined();
    expect(await storage.listUserIds()).not.toContain('user-a');

    // Other users and their sessions are untouched.
    expect(await storage.getUser('user-b')).toBeDefined();
    expect(await storage.getSettings('user-b')).toEqual(settings);
    expect(await storage.getCredits('user-b')).toEqual({ daily: { '2026-01-01': 1 }, total: 1 });
    expect((await storage.findSessionByTokenHash('b'.repeat(64)))?.id).toBe('s-b1');
  });

  it('deleteUser returns false for unknown users and for "local"', async () => {
    expect(await storage.deleteUser('nobody')).toBe(false);

    await storage.saveSettings('local', { ...DEFAULT_SETTINGS, updatedAt: CREATED });
    expect(await storage.deleteUser('local')).toBe(false);
    expect(await storage.getSettings('local')).toBeDefined();
  });

  it('saves and finds sessions by token hash (hit and miss)', async () => {
    await storage.saveSession(makeSession());

    expect(await storage.findSessionByTokenHash('a'.repeat(64))).toEqual(makeSession());
    expect(await storage.findSessionByTokenHash('a'.repeat(63))).toBeUndefined();
    expect(await storage.findSessionByTokenHash('b'.repeat(64))).toBeUndefined();
  });

  it('saveSession replaces by id and deleteSession removes it', async () => {
    await storage.saveSession(makeSession());
    await storage.saveSession(makeSession({ expiresAt: '2026-03-01T00:00:00.000Z' }));
    expect(await storage.findSessionByTokenHash('a'.repeat(64))).toMatchObject({
      expiresAt: '2026-03-01T00:00:00.000Z',
    });

    await storage.deleteSession('session-1');
    expect(await storage.findSessionByTokenHash('a'.repeat(64))).toBeUndefined();

    // Deleting a missing session is a no-op.
    await expect(storage.deleteSession('session-1')).resolves.toBeUndefined();
  });

  it('deleteUserSessions removes every session of the user and returns the count', async () => {
    await storage.saveSession(makeSession({ id: 's1', tokenHash: '1'.repeat(64) }));
    await storage.saveSession(makeSession({ id: 's2', tokenHash: '2'.repeat(64) }));
    await storage.saveSession(makeSession({ id: 's3', userId: 'user-b', tokenHash: '3'.repeat(64) }));

    expect(await storage.deleteUserSessions('user-a')).toBe(2);
    expect(await storage.findSessionByTokenHash('1'.repeat(64))).toBeUndefined();
    expect(await storage.findSessionByTokenHash('2'.repeat(64))).toBeUndefined();
    expect((await storage.findSessionByTokenHash('3'.repeat(64)))?.id).toBe('s3');
    expect(await storage.deleteUserSessions('user-a')).toBe(0);
  });

  it('deleteUserSessions keeps exceptSessionId and returns only the removed count', async () => {
    await storage.saveSession(makeSession({ id: 'keep', tokenHash: '1'.repeat(64) }));
    await storage.saveSession(makeSession({ id: 'gone-1', tokenHash: '2'.repeat(64) }));
    await storage.saveSession(makeSession({ id: 'gone-2', tokenHash: '3'.repeat(64) }));

    expect(await storage.deleteUserSessions('user-a', 'keep')).toBe(2);
    expect((await storage.findSessionByTokenHash('1'.repeat(64)))?.id).toBe('keep');
    expect(await storage.findSessionByTokenHash('2'.repeat(64))).toBeUndefined();
    expect(await storage.findSessionByTokenHash('3'.repeat(64))).toBeUndefined();
  });

  it('pruneExpiredSessions removes only sessions expiring before now', async () => {
    await storage.saveSession(makeSession({ id: 'old', tokenHash: '1'.repeat(64), expiresAt: '2026-01-10T00:00:00.000Z' }));
    await storage.saveSession(makeSession({ id: 'edge', tokenHash: '2'.repeat(64), expiresAt: '2026-01-15T00:00:00.000Z' }));
    await storage.saveSession(makeSession({ id: 'live', tokenHash: '3'.repeat(64), expiresAt: '2026-01-20T00:00:00.000Z' }));

    expect(await storage.pruneExpiredSessions('2026-01-15T00:00:00.000Z')).toBe(1);
    expect(await storage.findSessionByTokenHash('1'.repeat(64))).toBeUndefined();
    expect((await storage.findSessionByTokenHash('2'.repeat(64)))?.id).toBe('edge');
    expect((await storage.findSessionByTokenHash('3'.repeat(64)))?.id).toBe('live');
    expect(await storage.pruneExpiredSessions('2026-01-15T00:00:00.000Z')).toBe(0);
  });

  it('round-trips app config including signupsEnabled', async () => {
    expect(await storage.getAppConfig()).toBeUndefined();

    const config: StoredAppConfig = {
      defaultDailyLimit: 50,
      providerDailyQuotas: { gemini: 100, openai: 0 },
      signupsEnabled: false,
    };
    await storage.saveAppConfig(config);
    expect(await storage.getAppConfig()).toEqual(config);

    await storage.saveAppConfig({ defaultDailyLimit: null, providerDailyQuotas: {}, signupsEnabled: true });
    expect(await storage.getAppConfig()).toEqual({
      defaultDailyLimit: null,
      providerDailyQuotas: {},
      signupsEnabled: true,
    });

    // Data written before signups existed has no signupsEnabled; it stays absent (treated as true by callers).
    await storage.saveAppConfig({ defaultDailyLimit: null, providerDailyQuotas: {} });
    expect((await storage.getAppConfig())?.signupsEnabled).toBeUndefined();
  });

  it('round-trips credits', async () => {
    expect(await storage.getCredits('user-a')).toBeUndefined();

    const ledger: CreditLedger = { daily: { '2026-01-01': 2, '2026-01-02': 5 }, total: 7 };
    await storage.saveCredits('user-a', ledger);
    expect(await storage.getCredits('user-a')).toEqual(ledger);
  });

  it('keeps only the newest 62 credit day keys', async () => {
    const start = Date.UTC(2026, 0, 1);
    const dayKey = (offset: number) => new Date(start + offset * 86_400_000).toISOString().slice(0, 10);
    const daily: Record<string, number> = {};
    for (let i = 0; i < 70; i++) daily[dayKey(i)] = i + 1;
    await storage.saveCredits('user-a', { daily, total: 70 });

    const stored = await storage.getCredits('user-a');
    const keys = Object.keys(stored?.daily ?? {}).sort();
    expect(keys).toHaveLength(62);
    expect(keys[0]).toBe(dayKey(8));
    expect(keys[61]).toBe(dayKey(69));
    expect(stored?.daily[dayKey(69)]).toBe(70);
    expect(stored?.total).toBe(70);
  });

  it('includes stored user ids in listUserIds so history pruning reaches them', async () => {
    await storage.saveUser(makeUser({ id: 'account-only' }));
    expect(await storage.listUserIds()).toContain('account-only');
  });

  it('persists users, sessions, config and credits across a new instance on the same dir', async () => {
    await storage.saveUser(makeUser({ googleSub: 'google-sub-a' }));
    await storage.saveSession(makeSession());
    await storage.saveAppConfig({ defaultDailyLimit: 9, providerDailyQuotas: { gemini: 4 }, signupsEnabled: false });
    await storage.saveCredits('user-a', { daily: { '2026-03-01': 2 }, total: 2 });
    await storage.close();

    const reopened = new FileStorage(dir);
    await reopened.init();
    try {
      expect(await reopened.getUser('user-a')).toEqual(makeUser({ googleSub: 'google-sub-a' }));
      expect((await reopened.findUserByEmail('alice@example.com'))?.id).toBe('user-a');
      expect((await reopened.findUserByGoogleSub('google-sub-a'))?.id).toBe('user-a');
      expect(await reopened.findSessionByTokenHash('a'.repeat(64))).toEqual(makeSession());
      expect(await reopened.getAppConfig()).toEqual({
        defaultDailyLimit: 9,
        providerDailyQuotas: { gemini: 4 },
        signupsEnabled: false,
      });
      expect(await reopened.getCredits('user-a')).toEqual({ daily: { '2026-03-01': 2 }, total: 2 });
    } finally {
      await reopened.close();
    }
  });

  it('normalises users.json records written before the account fields existed', async () => {
    const legacyDir = mkdtempSync(join(tmpdir(), 'verba-legacy-'));
    try {
      mkdirSync(legacyDir, { recursive: true });
      writeFileSync(
        join(legacyDir, 'users.json'),
        JSON.stringify({
          'legacy-1': {
            id: 'legacy-1',
            name: 'Old token user',
            tokenHash: 'e'.repeat(64),
            disabled: false,
            dailyLimit: null,
            createdAt: CREATED,
            lastUsedAt: null,
          },
        }),
        'utf8',
      );

      const legacy = new FileStorage(legacyDir);
      await legacy.init();
      try {
        const user = await legacy.getUser('legacy-1');
        expect(user).toEqual({
          id: 'legacy-1',
          name: 'Old token user',
          email: '',
          passwordHash: null,
          googleSub: null,
          role: 'user',
          plan: 'free',
          mustChangePassword: false,
          disabled: false,
          dailyLimit: null,
          createdAt: CREATED,
          lastUsedAt: null,
        });
        expect(user).not.toHaveProperty('tokenHash');
        expect(await legacy.findUserByGoogleSub('anything')).toBeUndefined();
      } finally {
        await legacy.close();
      }
    } finally {
      rmSync(legacyDir, { recursive: true, force: true });
    }
  });
});
