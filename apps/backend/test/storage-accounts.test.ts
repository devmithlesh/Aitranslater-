import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_SETTINGS, type HistoryItem } from '@verba/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileStorage } from '../src/storage/file-storage';
import type { CreditLedger, StoredAppConfig, StoredUser } from '../src/storage/types';

function makeUser(overrides: Partial<StoredUser> = {}): StoredUser {
  return {
    id: 'user-a',
    name: 'Alice',
    tokenHash: 'a'.repeat(64),
    disabled: false,
    dailyLimit: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastUsedAt: null,
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

describe('FileStorage accounts, config and credits', () => {
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

  it('saves, gets and lists users', async () => {
    expect(await storage.listUsers()).toEqual([]);
    expect(await storage.getUser('user-a')).toBeUndefined();

    await storage.saveUser(makeUser());
    await storage.saveUser(makeUser({ id: 'user-b', name: 'Bob', tokenHash: 'b'.repeat(64) }));

    expect(await storage.getUser('user-a')).toEqual(makeUser());
    expect((await storage.listUsers()).map((user) => user.id)).toEqual(['user-a', 'user-b']);

    // saveUser replaces by id.
    await storage.saveUser(makeUser({ disabled: true, dailyLimit: 5 }));
    expect(await storage.getUser('user-a')).toMatchObject({ disabled: true, dailyLimit: 5 });
    expect(await storage.listUsers()).toHaveLength(2);
  });

  it('finds users by exact token hash (hit and miss)', async () => {
    await storage.saveUser(makeUser());

    expect((await storage.findUserByTokenHash('a'.repeat(64)))?.id).toBe('user-a');
    expect(await storage.findUserByTokenHash('a'.repeat(63))).toBeUndefined();
    expect(await storage.findUserByTokenHash('A'.repeat(64))).toBeUndefined();
    expect(await storage.findUserByTokenHash('b'.repeat(64))).toBeUndefined();
  });

  it('deleteUser removes the user and every record stored under that id', async () => {
    await storage.saveUser(makeUser());
    await storage.saveUser(makeUser({ id: 'user-b', tokenHash: 'b'.repeat(64) }));
    const settings = { ...DEFAULT_SETTINGS, updatedAt: '2026-01-01T00:00:00.000Z' };
    await storage.saveSettings('user-a', settings);
    await storage.insertHistory('user-a', makeHistoryItem('h1', '2026-01-01T00:00:00.000Z'));
    await storage.saveCredits('user-a', { daily: { '2026-01-01': 3 }, total: 3 });
    await storage.saveSettings('user-b', settings);
    await storage.saveCredits('user-b', { daily: { '2026-01-01': 1 }, total: 1 });

    expect(await storage.deleteUser('user-a')).toBe(true);

    expect(await storage.getUser('user-a')).toBeUndefined();
    expect(await storage.getSettings('user-a')).toBeUndefined();
    expect((await storage.queryHistory('user-a', { offset: 0, limit: 10 })).total).toBe(0);
    expect(await storage.getCredits('user-a')).toBeUndefined();
    expect(await storage.listUserIds()).not.toContain('user-a');

    // Other users are untouched.
    expect(await storage.getUser('user-b')).toBeDefined();
    expect(await storage.getSettings('user-b')).toEqual(settings);
    expect(await storage.getCredits('user-b')).toEqual({ daily: { '2026-01-01': 1 }, total: 1 });
  });

  it('deleteUser returns false for unknown users and for "local"', async () => {
    expect(await storage.deleteUser('nobody')).toBe(false);

    await storage.saveSettings('local', { ...DEFAULT_SETTINGS, updatedAt: '2026-01-01T00:00:00.000Z' });
    expect(await storage.deleteUser('local')).toBe(false);
    expect(await storage.getSettings('local')).toBeDefined();
  });

  it('round-trips app config', async () => {
    expect(await storage.getAppConfig()).toBeUndefined();

    const config: StoredAppConfig = { defaultDailyLimit: 50, providerDailyQuotas: { gemini: 100, openai: 0 } };
    await storage.saveAppConfig(config);
    expect(await storage.getAppConfig()).toEqual(config);

    await storage.saveAppConfig({ defaultDailyLimit: null, providerDailyQuotas: {} });
    expect(await storage.getAppConfig()).toEqual({ defaultDailyLimit: null, providerDailyQuotas: {} });
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

  it('persists users, config and credits across a new instance on the same dir', async () => {
    await storage.saveUser(makeUser());
    await storage.saveAppConfig({ defaultDailyLimit: 9, providerDailyQuotas: { gemini: 4 } });
    await storage.saveCredits('user-a', { daily: { '2026-03-01': 2 }, total: 2 });
    await storage.close();

    const reopened = new FileStorage(dir);
    await reopened.init();
    try {
      expect(await reopened.getUser('user-a')).toEqual(makeUser());
      expect((await reopened.findUserByTokenHash('a'.repeat(64)))?.id).toBe('user-a');
      expect(await reopened.getAppConfig()).toEqual({ defaultDailyLimit: 9, providerDailyQuotas: { gemini: 4 } });
      expect(await reopened.getCredits('user-a')).toEqual({ daily: { '2026-03-01': 2 }, total: 2 });
    } finally {
      await reopened.close();
    }
  });
});
