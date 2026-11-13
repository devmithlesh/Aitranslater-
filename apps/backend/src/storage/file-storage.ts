import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CustomAssistant, HistoryItem, UserSettings } from '@verba/shared';
import { LOCAL_USER_ID } from '../middleware/auth';
import type {
  ActivityAggregates,
  CreditLedger,
  ExtensionStatusRecord,
  HistoryFilter,
  HistoryPage,
  ProviderUsageRecord,
  Storage,
  StoredAppConfig,
  StoredProviderConfig,
  StoredUser,
} from './types';

interface Collections {
  settings: Record<string, UserSettings | undefined>;
  assistants: Record<string, CustomAssistant[] | undefined>;
  history: Record<string, HistoryItem[] | undefined>;
  providers: Record<string, Record<string, StoredProviderConfig> | undefined>;
  usage: Record<string, Record<string, ProviderUsageRecord> | undefined>;
  activity: Record<string, ActivityAggregates | undefined>;
  extension: Record<string, ExtensionStatusRecord | undefined>;
  users: Record<string, StoredUser | undefined>;
  appConfig: StoredAppConfig | undefined;
  credits: Record<string, CreditLedger | undefined>;
}

type CollectionName = keyof Collections;

const COLLECTION_NAMES: readonly CollectionName[] = [
  'settings',
  'assistants',
  'history',
  'providers',
  'usage',
  'activity',
  'extension',
  'users',
  'appConfig',
  'credits',
];

/** Collections keyed by userId. deleteUser removes the user's entry from each of these. */
const USER_SCOPED: readonly CollectionName[] = [
  'settings',
  'assistants',
  'history',
  'providers',
  'usage',
  'activity',
  'extension',
  'credits',
];

/** On-disk file name (without .json) per collection. */
const FILE_NAMES: Record<CollectionName, string> = {
  settings: 'settings',
  assistants: 'assistants',
  history: 'history',
  providers: 'providers',
  usage: 'usage',
  activity: 'activity',
  extension: 'extension',
  users: 'users',
  appConfig: 'app-config',
  credits: 'credits',
};

const RENAME_RETRIES = 5;

function emptyCollections(): Collections {
  return {
    settings: {},
    assistants: {},
    history: {},
    providers: {},
    usage: {},
    activity: {},
    extension: {},
    users: {},
    appConfig: undefined,
    credits: {},
  };
}

function hasOwn(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/** Credit ledgers keep this many most recent day keys. */
export const CREDIT_DAYS_KEPT = 62;

/** Keeps only the newest CREDIT_DAYS_KEPT day keys ("YYYY-MM-DD" sorts chronologically). */
export function pruneCreditDays(daily: Record<string, number>): Record<string, number> {
  const keys = Object.keys(daily).sort();
  const kept: Record<string, number> = {};
  for (const key of keys.slice(Math.max(0, keys.length - CREDIT_DAYS_KEPT))) kept[key] = daily[key] ?? 0;
  return kept;
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (err) {
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'ENOENT') return undefined;
    throw err;
  }
}

function isRetryableRenameError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err.code === 'EPERM' || err.code === 'EBUSY');
}

/** Writes to a temp file and renames it over the target. Windows needs retries (AV/indexer locks). */
async function writeFileAtomic(path: string, content: string): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, content, 'utf8');
  for (let attempt = 1; ; attempt++) {
    try {
      await rename(tmp, path);
      return;
    } catch (err) {
      if (attempt >= RENAME_RETRIES || !isRetryableRenameError(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, 40 * attempt));
    }
  }
}

/**
 * JSON-file storage. Each collection lives in `${dir}/<name>.json` and is held in memory.
 * Writes go through a single promise queue so files are never written concurrently.
 */
export class FileStorage implements Storage {
  readonly kind = 'file' as const;
  private data: Collections = emptyCollections();
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly dir: string) {}

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    for (const name of COLLECTION_NAMES) {
      const text = await readOptional(this.pathFor(name));
      if (text === undefined) continue;
      try {
        setCollection(this.data, name, JSON.parse(text));
      } catch {
        throw new Error(`${this.pathFor(name)} is not valid JSON. Move it aside to start with empty data.`);
      }
    }
  }

  async close(): Promise<void> {
    await this.queue;
  }

  async listUserIds(): Promise<string[]> {
    const ids = new Set<string>([
      ...Object.keys(this.data.settings),
      ...Object.keys(this.data.history),
      ...Object.keys(this.data.users),
    ]);
    return [...ids];
  }

  async getSettings(userId: string): Promise<UserSettings | undefined> {
    return this.data.settings[userId];
  }

  async saveSettings(userId: string, settings: UserSettings): Promise<void> {
    this.data.settings[userId] = settings;
    await this.persist('settings');
  }

  async listAssistants(userId: string): Promise<CustomAssistant[]> {
    return [...(this.data.assistants[userId] ?? [])];
  }

  async getAssistant(userId: string, id: string): Promise<CustomAssistant | undefined> {
    return this.data.assistants[userId]?.find((item) => item.id === id);
  }

  async saveAssistant(userId: string, assistant: CustomAssistant): Promise<void> {
    const list = this.data.assistants[userId] ?? [];
    const index = list.findIndex((item) => item.id === assistant.id);
    if (index === -1) list.push(assistant);
    else list[index] = assistant;
    this.data.assistants[userId] = list;
    await this.persist('assistants');
  }

  async deleteAssistant(userId: string, id: string): Promise<boolean> {
    const list = this.data.assistants[userId] ?? [];
    const next = list.filter((item) => item.id !== id);
    if (next.length === list.length) return false;
    this.data.assistants[userId] = next;
    await this.persist('assistants');
    return true;
  }

  async insertHistory(userId: string, item: HistoryItem): Promise<void> {
    const list = this.data.history[userId] ?? [];
    list.unshift(item);
    this.data.history[userId] = list;
    await this.persist('history');
  }

  async queryHistory(userId: string, filter: HistoryFilter): Promise<HistoryPage> {
    const needle = filter.q?.toLowerCase();
    const matches = (this.data.history[userId] ?? []).filter((item) => {
      if (filter.type && item.type !== filter.type) return false;
      if (filter.favorite !== undefined && item.favorite !== filter.favorite) return false;
      if (needle && !`${item.input}\n${item.output}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    return {
      items: matches.slice(filter.offset, filter.offset + filter.limit).map((item) => ({ ...item })),
      total: matches.length,
    };
  }

  async setHistoryFavorite(userId: string, id: string, favorite: boolean): Promise<HistoryItem | undefined> {
    const item = this.data.history[userId]?.find((entry) => entry.id === id);
    if (!item) return undefined;
    item.favorite = favorite;
    await this.persist('history');
    return { ...item };
  }

  async deleteHistoryItem(userId: string, id: string): Promise<boolean> {
    const list = this.data.history[userId] ?? [];
    const next = list.filter((item) => item.id !== id);
    if (next.length === list.length) return false;
    this.data.history[userId] = next;
    await this.persist('history');
    return true;
  }

  async clearHistory(userId: string): Promise<number> {
    const count = this.data.history[userId]?.length ?? 0;
    this.data.history[userId] = [];
    await this.persist('history');
    return count;
  }

  async pruneHistory(userId: string, beforeIso: string): Promise<number> {
    const list = this.data.history[userId] ?? [];
    const kept = list.filter((item) => item.favorite || item.createdAt >= beforeIso);
    const removed = list.length - kept.length;
    if (removed > 0) {
      this.data.history[userId] = kept;
      await this.persist('history');
    }
    return removed;
  }

  async getProviderConfigs(userId: string): Promise<Partial<Record<string, StoredProviderConfig>>> {
    return { ...(this.data.providers[userId] ?? {}) };
  }

  async saveProviderConfig(userId: string, providerId: string, config: StoredProviderConfig): Promise<void> {
    const map = this.data.providers[userId] ?? {};
    map[providerId] = config;
    this.data.providers[userId] = map;
    await this.persist('providers');
  }

  async getUsage(userId: string): Promise<Partial<Record<string, ProviderUsageRecord>>> {
    return { ...(this.data.usage[userId] ?? {}) };
  }

  async saveUsage(userId: string, providerId: string, record: ProviderUsageRecord): Promise<void> {
    const map = this.data.usage[userId] ?? {};
    map[providerId] = record;
    this.data.usage[userId] = map;
    await this.persist('usage');
  }

  async getActivity(userId: string): Promise<ActivityAggregates | undefined> {
    return this.data.activity[userId];
  }

  async saveActivity(userId: string, aggregates: ActivityAggregates): Promise<void> {
    this.data.activity[userId] = aggregates;
    await this.persist('activity');
  }

  async getExtensionStatus(userId: string): Promise<ExtensionStatusRecord | undefined> {
    return this.data.extension[userId];
  }

  async saveExtensionStatus(userId: string, status: ExtensionStatusRecord): Promise<void> {
    this.data.extension[userId] = status;
    await this.persist('extension');
  }

  // ── Accounts and credits ───────────────────────────────────────────

  async listUsers(): Promise<StoredUser[]> {
    return Object.values(this.data.users)
      .filter((user): user is StoredUser => user !== undefined)
      .map((user) => ({ ...user }));
  }

  async getUser(id: string): Promise<StoredUser | undefined> {
    const user = hasOwn(this.data.users, id) ? this.data.users[id] : undefined;
    return user ? { ...user } : undefined;
  }

  async findUserByTokenHash(tokenHash: string): Promise<StoredUser | undefined> {
    const user = Object.values(this.data.users).find((entry) => entry?.tokenHash === tokenHash);
    return user ? { ...user } : undefined;
  }

  async saveUser(user: StoredUser): Promise<void> {
    this.data.users[user.id] = { ...user };
    await this.persist('users');
  }

  async deleteUser(id: string): Promise<boolean> {
    if (id === LOCAL_USER_ID || !hasOwn(this.data.users, id)) return false;
    const touched: CollectionName[] = ['users'];
    delete this.data.users[id];
    for (const name of USER_SCOPED) {
      const bag = this.data[name] as Record<string, unknown>;
      if (!hasOwn(bag, id)) continue;
      delete bag[id];
      touched.push(name);
    }
    await Promise.all(touched.map((name) => this.persist(name)));
    return true;
  }

  async getAppConfig(): Promise<StoredAppConfig | undefined> {
    const config = this.data.appConfig;
    return config ? { ...config, providerDailyQuotas: { ...config.providerDailyQuotas } } : undefined;
  }

  async saveAppConfig(config: StoredAppConfig): Promise<void> {
    this.data.appConfig = { ...config, providerDailyQuotas: { ...config.providerDailyQuotas } };
    await this.persist('appConfig');
  }

  async getCredits(userId: string): Promise<CreditLedger | undefined> {
    const ledger = hasOwn(this.data.credits, userId) ? this.data.credits[userId] : undefined;
    return ledger ? { daily: { ...ledger.daily }, total: ledger.total } : undefined;
  }

  async saveCredits(userId: string, ledger: CreditLedger): Promise<void> {
    this.data.credits[userId] = { daily: pruneCreditDays(ledger.daily), total: ledger.total };
    await this.persist('credits');
  }

  private pathFor(name: CollectionName): string {
    return join(this.dir, `${FILE_NAMES[name]}.json`);
  }

  /** Snapshots the collection now and queues the write, so writes land in call order. */
  private persist(name: CollectionName): Promise<void> {
    const payload = JSON.stringify(this.data[name], null, 2);
    const target = this.pathFor(name);
    const write = this.queue.then(() => writeFileAtomic(target, payload));
    this.queue = write.catch(() => undefined);
    return write;
  }
}

function setCollection<K extends CollectionName>(data: Collections, name: K, value: Collections[K]): void {
  data[name] = value;
}
