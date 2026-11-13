import type { ActivityType, ClientKind, CustomAssistant, HistoryItem, UserSettings } from '@verba/shared';

export interface StoredProviderConfig {
  enabled: boolean;
  priority: number;
  /** AES-256-GCM ciphertext (utils/crypto.ts). Never sent to clients. */
  apiKeyEnc: string | null;
  baseUrl: string | null;
  model: string | null;
  region: string | null;
  lastError: { message: string; at: string } | null;
}

export interface UsageBucket {
  requests: number;
  errors: number;
  chars: number;
  /** Sum of latencies of successful calls. */
  latencyMs: number;
  /** AI tokens reported by the provider. Optional: buckets written before token tracking lack it (treat as 0). */
  tokens?: number;
}

/** An email + password account. The token admin ("local", VERBA_ACCESS_TOKEN) is not stored here. */
export interface StoredUser {
  /** randomUUID(); never "local". */
  id: string;
  name: string;
  /** Trimmed + lower-cased; unique across accounts. */
  email: string;
  /** "scrypt$N$r$p$<saltB64>$<hashB64>" — see services/password.ts. null = Google-only account. Never the password itself. */
  passwordHash: string | null;
  /** Google account id ("sub" claim) once linked; unique. */
  googleSub: string | null;
  role: 'admin' | 'user';
  plan: 'free' | 'unlimited';
  /** Set by an admin password reset; cleared by change-password. */
  mustChangePassword: boolean;
  disabled: boolean;
  /** null = follow StoredAppConfig.defaultDailyLimit. */
  dailyLimit: number | null;
  createdAt: string;
  lastUsedAt: string | null;
}

/** A login session. The bearer token is never stored, only its SHA-256 hex. */
export interface StoredSession {
  /** randomUUID() */
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
}

/** Server-wide settings managed by the admin. */
export interface StoredAppConfig {
  /** Optional for data written before signups existed: treat missing as true. */
  signupsEnabled?: boolean;
  defaultDailyLimit: number | null;
  providerDailyQuotas: Record<string, number>;
}

/** Translation credits used by one account (admin included, under "local"). */
export interface CreditLedger {
  /** dayKey ("YYYY-MM-DD", server local) → successful translations that day. Keep at most the last 62 days. */
  daily: Record<string, number>;
  /** All-time count. */
  total: number;
}

export interface ProviderUsageRecord {
  daily: Record<string, UsageBucket>;
  monthly: Record<string, UsageBucket>;
  lastUsedAt: string | null;
}

/** Aggregates kept regardless of the saveHistory setting. */
export interface ActivityAggregates {
  totals: Record<ActivityType, number>;
  daily: Record<string, Partial<Record<ActivityType, number>>>;
  languages: Record<string, number>;
  byClient: Record<ClientKind, number>;
  charsProcessed: number;
}

export interface ExtensionStatusRecord {
  lastSeenAt: string;
  version: string;
}

export interface HistoryFilter {
  type?: ActivityType;
  q?: string;
  favorite?: boolean;
  offset: number;
  limit: number;
}

export interface HistoryPage {
  items: HistoryItem[];
  total: number;
}

/**
 * Persistence boundary. Every method is keyed by userId (currently always "local").
 * Implementations: FileStorage (default) and SupabaseStorage (STORAGE=supabase).
 */
export interface Storage {
  readonly kind: 'file' | 'supabase';
  init(): Promise<void>;
  close(): Promise<void>;

  listUserIds(): Promise<string[]>;

  getSettings(userId: string): Promise<UserSettings | undefined>;
  saveSettings(userId: string, settings: UserSettings): Promise<void>;

  listAssistants(userId: string): Promise<CustomAssistant[]>;
  getAssistant(userId: string, id: string): Promise<CustomAssistant | undefined>;
  saveAssistant(userId: string, assistant: CustomAssistant): Promise<void>;
  deleteAssistant(userId: string, id: string): Promise<boolean>;

  insertHistory(userId: string, item: HistoryItem): Promise<void>;
  queryHistory(userId: string, filter: HistoryFilter): Promise<HistoryPage>;
  setHistoryFavorite(userId: string, id: string, favorite: boolean): Promise<HistoryItem | undefined>;
  deleteHistoryItem(userId: string, id: string): Promise<boolean>;
  clearHistory(userId: string): Promise<number>;
  /** Deletes non-favorite items created before `beforeIso`. Returns the number removed. */
  pruneHistory(userId: string, beforeIso: string): Promise<number>;

  getProviderConfigs(userId: string): Promise<Partial<Record<string, StoredProviderConfig>>>;
  saveProviderConfig(userId: string, providerId: string, config: StoredProviderConfig): Promise<void>;

  getUsage(userId: string): Promise<Partial<Record<string, ProviderUsageRecord>>>;
  saveUsage(userId: string, providerId: string, record: ProviderUsageRecord): Promise<void>;

  getActivity(userId: string): Promise<ActivityAggregates | undefined>;
  saveActivity(userId: string, aggregates: ActivityAggregates): Promise<void>;

  getExtensionStatus(userId: string): Promise<ExtensionStatusRecord | undefined>;
  saveExtensionStatus(userId: string, status: ExtensionStatusRecord): Promise<void>;

  // ── Accounts and credits ───────────────────────────────────────────
  listUsers(): Promise<StoredUser[]>;
  getUser(id: string): Promise<StoredUser | undefined>;
  /** `email` is already trimmed + lower-cased by the caller; exact match. */
  findUserByEmail(email: string): Promise<StoredUser | undefined>;
  findUserByGoogleSub(googleSub: string): Promise<StoredUser | undefined>;
  /** Insert or replace by id. Callers guarantee email uniqueness (Supabase also enforces it). */
  saveUser(user: StoredUser): Promise<void>;
  /** Removes the user AND all data stored under that userId (settings, assistants, history, usage, activity, extension status, credits, sessions). */
  deleteUser(id: string): Promise<boolean>;

  saveSession(session: StoredSession): Promise<void>;
  findSessionByTokenHash(tokenHash: string): Promise<StoredSession | undefined>;
  deleteSession(id: string): Promise<void>;
  /** Deletes every session of the user except `exceptSessionId`. Returns how many were removed. */
  deleteUserSessions(userId: string, exceptSessionId?: string): Promise<number>;
  /** Deletes sessions whose expiresAt is before `nowIso`. Returns how many were removed. */
  pruneExpiredSessions(nowIso: string): Promise<number>;

  getAppConfig(): Promise<StoredAppConfig | undefined>;
  saveAppConfig(config: StoredAppConfig): Promise<void>;

  getCredits(userId: string): Promise<CreditLedger | undefined>;
  saveCredits(userId: string, ledger: CreditLedger): Promise<void>;
}
