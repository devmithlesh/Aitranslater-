import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient, SupabaseClientOptions } from '@supabase/supabase-js';
import { z } from 'zod';
import { ACTIVITY_TYPES, FEEDBACK_CATEGORIES, type CustomAssistant, type HistoryItem, type UserSettings } from '@verba/shared';
import { LOCAL_USER_ID } from '../middleware/auth';
import { pruneCreditDays } from './file-storage';
import type {
  ActivityAggregates,
  CreditLedger,
  ExtensionStatusRecord,
  FeedbackRecord,
  HistoryFilter,
  HistoryPage,
  ProviderUsageRecord,
  Storage,
  StoredAppConfig,
  StoredProviderConfig,
  StoredSession,
  StoredUser,
} from './types';

/*
 * Supabase (Postgres) storage. Uses the service-role key server-side only; RLS is
 * enabled without public policies (see supabase/schema.sql). jsonb payloads are
 * written by this process, so they are read back with a type assertion.
 */

const historyRowSchema = z.object({
  id: z.string(),
  type: z.enum(ACTIVITY_TYPES),
  favorite: z.boolean(),
  input: z.string(),
  output: z.string(),
  meta: z.record(z.unknown()),
  client: z.enum(['web', 'extension']),
  created_at: z.string(),
});

type HistoryRow = z.infer<typeof historyRowSchema>;

function toHistoryItem(row: HistoryRow): HistoryItem {
  return {
    id: row.id,
    type: row.type,
    input: row.input,
    output: row.output,
    meta: row.meta as HistoryItem['meta'],
    client: row.client,
    favorite: row.favorite,
    createdAt: row.created_at,
  };
}

function escapeIlikeValue(value: string): string {
  return value.replace(/\*/g, '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function assertNoError(error: { message: string } | null, operation: string): void {
  if (error) throw new Error(`Supabase ${operation} failed: ${error.message}`);
}

/** Singleton row key in app_config. */
const APP_CONFIG_ROW_ID = 'global';

/**
 * Per-user tables (user_id column). Deleted by deleteUser. app_sessions is removed explicitly
 * (the FK cascade would also do it); app_users is removed last so a failed delete can be retried.
 */
const USER_SCOPED_TABLES = [
  'user_settings',
  'custom_assistants',
  'history_items',
  'provider_configs',
  'usage_stats',
  'activity_stats',
  'extension_status',
  'credit_ledgers',
  'app_sessions',
] as const;

const appUserRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  password_hash: z.string().nullable(),
  google_sub: z.string().nullable(),
  role: z.enum(['admin', 'user']),
  plan: z.enum(['free', 'unlimited']),
  must_change_password: z.boolean(),
  disabled: z.boolean(),
  daily_limit: z.number().nullable(),
  created_at: z.string(),
  last_used_at: z.string().nullable(),
});

type AppUserRow = z.infer<typeof appUserRowSchema>;

const appSessionRowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  token_hash: z.string(),
  created_at: z.string(),
  expires_at: z.string(),
});

type AppSessionRow = z.infer<typeof appSessionRowSchema>;

const appConfigRowSchema = z.object({
  default_daily_limit: z.number().nullable(),
  provider_daily_quotas: z.record(z.number()),
  signups_enabled: z.boolean(),
});

const feedbackRowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  category: z.enum(FEEDBACK_CATEGORIES),
  message: z.string(),
  client: z.enum(['web', 'extension']),
  version: z.string().nullable(),
  created_at: z.string(),
});

const creditRowSchema = z.object({
  daily: z.record(z.number()),
  total: z.number(),
});

function toStoredUser(row: AppUserRow): StoredUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    googleSub: row.google_sub,
    role: row.role,
    plan: row.plan,
    mustChangePassword: row.must_change_password,
    disabled: row.disabled,
    dailyLimit: row.daily_limit,
    // Postgres returns "+00:00" offsets; normalise to the ISO form the rest of the app stores.
    createdAt: new Date(row.created_at).toISOString(),
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
  };
}

function toUserRow(user: StoredUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    password_hash: user.passwordHash,
    google_sub: user.googleSub,
    role: user.role,
    plan: user.plan,
    must_change_password: user.mustChangePassword,
    disabled: user.disabled,
    daily_limit: user.dailyLimit,
    created_at: user.createdAt,
    last_used_at: user.lastUsedAt,
  };
}

function toStoredSession(row: AppSessionRow): StoredSession {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    createdAt: new Date(row.created_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
  };
}

const SUPABASE_TIMEOUT_MS = 10_000;

/** fetch with a deadline, keeping any abort signal the caller passed. */
function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const timeout = AbortSignal.timeout(SUPABASE_TIMEOUT_MS);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
}

type RealtimeOptions = NonNullable<SupabaseClientOptions<'public'>['realtime']>;

/** Stand-in WebSocket for supabase-js. Realtime is never used, so constructing it is a bug. */
class RealtimeUnused {
  constructor() {
    throw new Error('Supabase Realtime is not used by Verba.');
  }
}

export class SupabaseStorage implements Storage {
  readonly kind = 'supabase' as const;
  private readonly client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      // A hung request must not hold the credit/usage locks forever: every call gets a deadline.
      global: { fetch: fetchWithTimeout },
      // Verba never uses Realtime. Without a transport, supabase-js looks for a native WebSocket
      // when the client is created and fails on Node 20; this stub is never constructed.
      realtime: { transport: RealtimeUnused as unknown as NonNullable<RealtimeOptions['transport']> },
    });
  }

  async init(): Promise<void> {
    const { error } = await this.client.from('user_settings').select('user_id').limit(1);
    if (error) throw new Error(`Supabase connection failed: ${error.message}. Have you run supabase/schema.sql?`);
  }

  async close(): Promise<void> {
    // The HTTP client holds no resources that need releasing.
  }

  async listUserIds(): Promise<string[]> {
    // Union of users with settings and accounts created by the admin, so retention pruning reaches both.
    const [settings, users] = await Promise.all([
      this.client.from('user_settings').select('user_id'),
      this.client.from('app_users').select('id'),
    ]);
    assertNoError(settings.error, 'listUserIds');
    assertNoError(users.error, 'listUserIds');
    const settingRows = z.array(z.object({ user_id: z.string() })).parse(settings.data ?? []);
    const userRows = z.array(z.object({ id: z.string() })).parse(users.data ?? []);
    return [...new Set([...settingRows.map((row) => row.user_id), ...userRows.map((row) => row.id)])];
  }

  async getSettings(userId: string): Promise<UserSettings | undefined> {
    const { data, error } = await this.client
      .from('user_settings')
      .select('data')
      .eq('user_id', userId)
      .maybeSingle();
    assertNoError(error, 'getSettings');
    return data ? (data.data as UserSettings) : undefined;
  }

  async saveSettings(userId: string, settings: UserSettings): Promise<void> {
    const { error } = await this.client.from('user_settings').upsert({
      user_id: userId,
      data: settings,
      updated_at: settings.updatedAt,
    });
    assertNoError(error, 'saveSettings');
  }

  async listAssistants(userId: string): Promise<CustomAssistant[]> {
    const { data, error } = await this.client
      .from('custom_assistants')
      .select('data')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    assertNoError(error, 'listAssistants');
    return (data ?? []).map((row: { data: unknown }) => row.data as CustomAssistant);
  }

  async getAssistant(userId: string, id: string): Promise<CustomAssistant | undefined> {
    const { data, error } = await this.client
      .from('custom_assistants')
      .select('data')
      .eq('user_id', userId)
      .eq('id', id)
      .maybeSingle();
    assertNoError(error, 'getAssistant');
    return data ? (data.data as CustomAssistant) : undefined;
  }

  async saveAssistant(userId: string, assistant: CustomAssistant): Promise<void> {
    const { error } = await this.client.from('custom_assistants').upsert({
      id: assistant.id,
      user_id: userId,
      data: assistant,
      created_at: assistant.createdAt,
    });
    assertNoError(error, 'saveAssistant');
  }

  async deleteAssistant(userId: string, id: string): Promise<boolean> {
    const { data, error } = await this.client
      .from('custom_assistants')
      .delete()
      .eq('user_id', userId)
      .eq('id', id)
      .select('id');
    assertNoError(error, 'deleteAssistant');
    return (data ?? []).length > 0;
  }

  async insertHistory(userId: string, item: HistoryItem): Promise<void> {
    const { error } = await this.client.from('history_items').insert({
      id: item.id,
      user_id: userId,
      type: item.type,
      favorite: item.favorite,
      input: item.input,
      output: item.output,
      meta: item.meta,
      client: item.client,
      created_at: item.createdAt,
    });
    assertNoError(error, 'insertHistory');
  }

  async queryHistory(userId: string, filter: HistoryFilter): Promise<HistoryPage> {
    let query = this.client
      .from('history_items')
      .select('*', { count: 'exact' })
      .eq('user_id', userId);
    if (filter.type) query = query.eq('type', filter.type);
    if (filter.favorite !== undefined) query = query.eq('favorite', filter.favorite);
    if (filter.q) {
      const pattern = `*${escapeIlikeValue(filter.q)}*`;
      query = query.or(`input.ilike."${pattern}",output.ilike."${pattern}"`);
    }
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(filter.offset, filter.offset + filter.limit - 1);
    assertNoError(error, 'queryHistory');
    const rows = z.array(historyRowSchema).parse(data ?? []);
    return { items: rows.map(toHistoryItem), total: count ?? rows.length };
  }

  async setHistoryFavorite(userId: string, id: string, favorite: boolean): Promise<HistoryItem | undefined> {
    const { data, error } = await this.client
      .from('history_items')
      .update({ favorite })
      .eq('user_id', userId)
      .eq('id', id)
      .select('*');
    assertNoError(error, 'setHistoryFavorite');
    const rows = z.array(historyRowSchema).parse(data ?? []);
    const row = rows[0];
    return row ? toHistoryItem(row) : undefined;
  }

  async deleteHistoryItem(userId: string, id: string): Promise<boolean> {
    const { data, error } = await this.client
      .from('history_items')
      .delete()
      .eq('user_id', userId)
      .eq('id', id)
      .select('id');
    assertNoError(error, 'deleteHistoryItem');
    return (data ?? []).length > 0;
  }

  async clearHistory(userId: string): Promise<number> {
    const { data, error } = await this.client.from('history_items').delete().eq('user_id', userId).select('id');
    assertNoError(error, 'clearHistory');
    return (data ?? []).length;
  }

  async pruneHistory(userId: string, beforeIso: string): Promise<number> {
    const { data, error } = await this.client
      .from('history_items')
      .delete()
      .eq('user_id', userId)
      .eq('favorite', false)
      .lt('created_at', beforeIso)
      .select('id');
    assertNoError(error, 'pruneHistory');
    return (data ?? []).length;
  }

  async getProviderConfigs(userId: string): Promise<Partial<Record<string, StoredProviderConfig>>> {
    const { data, error } = await this.client
      .from('provider_configs')
      .select('provider_id, data')
      .eq('user_id', userId);
    assertNoError(error, 'getProviderConfigs');
    const result: Partial<Record<string, StoredProviderConfig>> = {};
    for (const row of data ?? []) {
      result[String(row.provider_id)] = row.data as StoredProviderConfig;
    }
    return result;
  }

  async saveProviderConfig(userId: string, providerId: string, config: StoredProviderConfig): Promise<void> {
    const { error } = await this.client.from('provider_configs').upsert({
      user_id: userId,
      provider_id: providerId,
      data: config,
    });
    assertNoError(error, 'saveProviderConfig');
  }

  async getUsage(userId: string): Promise<Partial<Record<string, ProviderUsageRecord>>> {
    const { data, error } = await this.client
      .from('usage_stats')
      .select('provider_id, data')
      .eq('user_id', userId);
    assertNoError(error, 'getUsage');
    const result: Partial<Record<string, ProviderUsageRecord>> = {};
    for (const row of data ?? []) {
      result[String(row.provider_id)] = row.data as ProviderUsageRecord;
    }
    return result;
  }

  async saveUsage(userId: string, providerId: string, record: ProviderUsageRecord): Promise<void> {
    const { error } = await this.client.from('usage_stats').upsert({
      user_id: userId,
      provider_id: providerId,
      data: record,
    });
    assertNoError(error, 'saveUsage');
  }

  async getActivity(userId: string): Promise<ActivityAggregates | undefined> {
    const { data, error } = await this.client.from('activity_stats').select('data').eq('user_id', userId).maybeSingle();
    assertNoError(error, 'getActivity');
    return data ? (data.data as ActivityAggregates) : undefined;
  }

  async saveActivity(userId: string, aggregates: ActivityAggregates): Promise<void> {
    const { error } = await this.client.from('activity_stats').upsert({ user_id: userId, data: aggregates });
    assertNoError(error, 'saveActivity');
  }

  async getExtensionStatus(userId: string): Promise<ExtensionStatusRecord | undefined> {
    const { data, error } = await this.client
      .from('extension_status')
      .select('data')
      .eq('user_id', userId)
      .maybeSingle();
    assertNoError(error, 'getExtensionStatus');
    return data ? (data.data as ExtensionStatusRecord) : undefined;
  }

  async saveExtensionStatus(userId: string, status: ExtensionStatusRecord): Promise<void> {
    const { error } = await this.client.from('extension_status').upsert({ user_id: userId, data: status });
    assertNoError(error, 'saveExtensionStatus');
  }

  // ── Accounts and credits ───────────────────────────────────────────

  async listUsers(): Promise<StoredUser[]> {
    const { data, error } = await this.client.from('app_users').select('*').order('created_at', { ascending: true });
    assertNoError(error, 'listUsers');
    return z.array(appUserRowSchema).parse(data ?? []).map(toStoredUser);
  }

  async getUser(id: string): Promise<StoredUser | undefined> {
    const { data, error } = await this.client.from('app_users').select('*').eq('id', id).maybeSingle();
    assertNoError(error, 'getUser');
    return data ? toStoredUser(appUserRowSchema.parse(data)) : undefined;
  }

  async findUserByEmail(email: string): Promise<StoredUser | undefined> {
    const { data, error } = await this.client.from('app_users').select('*').eq('email', email).maybeSingle();
    assertNoError(error, 'findUserByEmail');
    return data ? toStoredUser(appUserRowSchema.parse(data)) : undefined;
  }

  async findUserByGoogleSub(googleSub: string): Promise<StoredUser | undefined> {
    // SQL `=` never matches NULL, so accounts without a Google link cannot match.
    const { data, error } = await this.client.from('app_users').select('*').eq('google_sub', googleSub).maybeSingle();
    assertNoError(error, 'findUserByGoogleSub');
    return data ? toStoredUser(appUserRowSchema.parse(data)) : undefined;
  }

  async saveUser(user: StoredUser): Promise<void> {
    const { error } = await this.client.from('app_users').upsert(toUserRow(user));
    assertNoError(error, 'saveUser');
  }

  async deleteUser(id: string): Promise<boolean> {
    if (id === LOCAL_USER_ID) return false;
    const existing = await this.getUser(id);
    if (!existing) return false;
    for (const table of USER_SCOPED_TABLES) {
      const { error } = await this.client.from(table).delete().eq('user_id', id);
      assertNoError(error, `deleteUser(${table})`);
    }
    const { error } = await this.client.from('app_users').delete().eq('id', id);
    assertNoError(error, 'deleteUser(app_users)');
    return true;
  }

  async saveSession(session: StoredSession): Promise<void> {
    const { error } = await this.client.from('app_sessions').upsert({
      id: session.id,
      user_id: session.userId,
      token_hash: session.tokenHash,
      created_at: session.createdAt,
      expires_at: session.expiresAt,
    });
    assertNoError(error, 'saveSession');
  }

  async findSessionByTokenHash(tokenHash: string): Promise<StoredSession | undefined> {
    const { data, error } = await this.client
      .from('app_sessions')
      .select('*')
      .eq('token_hash', tokenHash)
      .maybeSingle();
    assertNoError(error, 'findSessionByTokenHash');
    return data ? toStoredSession(appSessionRowSchema.parse(data)) : undefined;
  }

  async deleteSession(id: string): Promise<void> {
    const { error } = await this.client.from('app_sessions').delete().eq('id', id);
    assertNoError(error, 'deleteSession');
  }

  async deleteUserSessions(userId: string, exceptSessionId?: string): Promise<number> {
    let query = this.client.from('app_sessions').delete().eq('user_id', userId);
    if (exceptSessionId !== undefined) query = query.neq('id', exceptSessionId);
    const { data, error } = await query.select('id');
    assertNoError(error, 'deleteUserSessions');
    return (data ?? []).length;
  }

  async pruneExpiredSessions(nowIso: string): Promise<number> {
    const { data, error } = await this.client.from('app_sessions').delete().lt('expires_at', nowIso).select('id');
    assertNoError(error, 'pruneExpiredSessions');
    return (data ?? []).length;
  }

  async getAppConfig(): Promise<StoredAppConfig | undefined> {
    const { data, error } = await this.client
      .from('app_config')
      .select('default_daily_limit, provider_daily_quotas, signups_enabled')
      .eq('id', APP_CONFIG_ROW_ID)
      .maybeSingle();
    assertNoError(error, 'getAppConfig');
    if (!data) return undefined;
    const row = appConfigRowSchema.parse(data);
    return {
      defaultDailyLimit: row.default_daily_limit,
      providerDailyQuotas: row.provider_daily_quotas,
      signupsEnabled: row.signups_enabled,
    };
  }

  async saveAppConfig(config: StoredAppConfig): Promise<void> {
    const { error } = await this.client.from('app_config').upsert({
      id: APP_CONFIG_ROW_ID,
      default_daily_limit: config.defaultDailyLimit,
      provider_daily_quotas: config.providerDailyQuotas,
      signups_enabled: config.signupsEnabled ?? true,
    });
    assertNoError(error, 'saveAppConfig');
  }

  async insertFeedback(item: FeedbackRecord): Promise<void> {
    const { error } = await this.client.from('feedback').insert({
      id: item.id,
      user_id: item.userId,
      category: item.category,
      message: item.message,
      client: item.client,
      version: item.version,
      created_at: item.createdAt,
    });
    assertNoError(error, 'insertFeedback');
  }

  async listFeedback(limit: number): Promise<FeedbackRecord[]> {
    const { data, error } = await this.client
      .from('feedback')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    assertNoError(error, 'listFeedback');
    return (data ?? []).map((row) => feedbackRowSchema.parse(row)).map((row) => ({
      id: row.id,
      userId: row.user_id,
      category: row.category,
      message: row.message,
      client: row.client,
      version: row.version,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  async getCredits(userId: string): Promise<CreditLedger | undefined> {
    const { data, error } = await this.client
      .from('credit_ledgers')
      .select('daily, total')
      .eq('user_id', userId)
      .maybeSingle();
    assertNoError(error, 'getCredits');
    if (!data) return undefined;
    const row = creditRowSchema.parse(data);
    return { daily: row.daily, total: row.total };
  }

  async saveCredits(userId: string, ledger: CreditLedger): Promise<void> {
    const { error } = await this.client.from('credit_ledgers').upsert({
      user_id: userId,
      daily: pruneCreditDays(ledger.daily),
      total: ledger.total,
    });
    assertNoError(error, 'saveCredits');
  }
}
