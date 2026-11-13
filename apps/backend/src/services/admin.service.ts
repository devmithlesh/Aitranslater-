import type {
  AdminConfig,
  AdminUsageResponse,
  DailyPoint,
  ProviderUsageReport,
} from '@verba/shared';
import { LOCAL_USER_ID } from '../middleware/auth';
import type { Storage, StoredAppConfig } from '../storage/types';
import { dayKey, daysAgo } from '../utils/dates';
import { ledgerTotals, readAppConfig } from './credits.service';
import type { ProviderRegistry } from './provider-registry';
import { summarizeUsage } from './usage.service';
import type { UsageService } from './usage.service';

const DAILY_WINDOW_DAYS = 14;

/** What PUT /api/admin/config accepts after validation. A null quota removes that provider. */
export interface AdminConfigPatch {
  defaultDailyLimit?: number | null;
  providerDailyQuotas?: Partial<Record<string, number | null>>;
}

/** The last `count` local days, "YYYY-MM-DD", oldest first. */
function lastDays(now: Date, count: number): string[] {
  return Array.from({ length: count }, (_, index) => dayKey(daysAgo(now, count - 1 - index)));
}

/** Server-wide settings and the shared API usage page. */
export class AdminService {
  constructor(
    private readonly storage: Storage,
    private readonly registry: ProviderRegistry,
    private readonly usageService: UsageService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getConfig(): Promise<AdminConfig> {
    return toAdminConfig(await readAppConfig(this.storage));
  }

  /** Omitted fields keep their stored value. `providerDailyQuotas` replaces the whole map; null entries are dropped. */
  async updateConfig(update: AdminConfigPatch): Promise<AdminConfig> {
    const current = await readAppConfig(this.storage);
    const next: StoredAppConfig = {
      defaultDailyLimit: update.defaultDailyLimit !== undefined ? update.defaultDailyLimit : current.defaultDailyLimit,
      providerDailyQuotas:
        update.providerDailyQuotas !== undefined ? compactQuotas(update.providerDailyQuotas) : current.providerDailyQuotas,
    };
    await this.storage.saveAppConfig(next);
    return toAdminConfig(next);
  }

  async usage(): Promise<AdminUsageResponse> {
    const now = this.now();
    const days = lastDays(now, DAILY_WINDOW_DAYS);
    const [config, records, entries, users] = await Promise.all([
      readAppConfig(this.storage),
      this.usageService.getAllUsage(LOCAL_USER_ID),
      this.registry.entries(LOCAL_USER_ID),
      this.storage.listUsers(),
    ]);

    const providers: ProviderUsageReport[] = [];
    for (const entry of entries) {
      if (entry.descriptor.kind !== 'llm' && entry.descriptor.kind !== 'translation') continue;
      const record = records[entry.id];
      const dailyRequests: DailyPoint[] = days.map((day) => ({ day, value: record?.daily[day]?.requests ?? 0 }));
      const dailyTokens: DailyPoint[] = days.map((day) => ({ day, value: record?.daily[day]?.tokens ?? 0 }));
      const recentRequests = dailyRequests.reduce((sum, point) => sum + point.value, 0);
      // The virtual "llm" translator has no usage of its own; it only appears when it has some.
      if (entry.id === 'llm' && recentRequests === 0) continue;
      if (!entry.ready && recentRequests === 0) continue;
      providers.push({
        id: entry.id,
        name: entry.descriptor.name,
        kind: entry.descriptor.kind,
        model: entry.cfg.model,
        ready: entry.ready,
        usage: summarizeUsage(record, now),
        dailyQuota: config.providerDailyQuotas[entry.id] ?? null,
        dailyRequests,
        dailyTokens,
      });
    }

    const ledgers = await Promise.all(
      [LOCAL_USER_ID, ...users.map((user) => user.id)].map((id) => this.storage.getCredits(id)),
    );
    let today = 0;
    let thisMonth = 0;
    let activeUsersToday = 0;
    const dailyTotals = new Map<string, number>(days.map((day) => [day, 0]));
    for (const ledger of ledgers) {
      const totals = ledgerTotals(ledger, now);
      today += totals.usedToday;
      thisMonth += totals.usedThisMonth;
      if (totals.usedToday > 0) activeUsersToday += 1;
      for (const day of days) {
        dailyTotals.set(day, (dailyTotals.get(day) ?? 0) + (ledger?.daily[day] ?? 0));
      }
    }

    return {
      providers,
      translations: {
        today,
        thisMonth,
        daily: days.map((day) => ({ day, value: dailyTotals.get(day) ?? 0 })),
      },
      totalUsers: users.length,
      activeUsersToday,
    };
  }
}

function toAdminConfig(config: StoredAppConfig): AdminConfig {
  return {
    defaultDailyLimit: config.defaultDailyLimit,
    providerDailyQuotas: { ...config.providerDailyQuotas } as AdminConfig['providerDailyQuotas'],
  };
}

function compactQuotas(quotas: Partial<Record<string, number | null>>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [id, value] of Object.entries(quotas)) {
    if (typeof value === 'number') result[id] = value;
  }
  return result;
}
