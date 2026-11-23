import { ACTIVITY_TYPES } from '@verba/shared';
import type { ExtensionStatusResponse, ProviderUsage, StatsResponse } from '@verba/shared';
import type { Storage } from '../storage/types';
import { daysAgo, dayKey } from '../utils/dates';
import { usageSummariesFor } from './usage.service';
import type { UsageService } from './usage.service';

const EXTENSION_ONLINE_MS = 10 * 60 * 1000;
const DAILY_WINDOW_DAYS = 14;
const TOP_LANGUAGES = 6;

export class StatsService {
  constructor(
    private readonly storage: Storage,
    private readonly usage: UsageService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async stats(userId: string): Promise<StatsResponse> {
    const now = this.now();
    const activity = await this.usage.getActivity(userId);
    const all = ACTIVITY_TYPES.reduce((sum, type) => sum + activity.totals[type], 0);

    const daily: StatsResponse['daily'] = [];
    for (let offset = DAILY_WINDOW_DAYS - 1; offset >= 0; offset--) {
      const date = dayKey(daysAgo(now, offset));
      const counts = activity.daily[date] ?? {};
      const count = Object.values(counts).reduce<number>((sum, value) => sum + (value ?? 0), 0);
      daily.push({ date, count });
    }

    const topTools = ACTIVITY_TYPES.map((type) => ({ type, count: activity.totals[type] }))
      .filter((tool) => tool.count > 0)
      .sort((a, b) => b.count - a.count);

    const topLanguages = Object.entries(activity.languages)
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_LANGUAGES);

    return {
      totals: { ...activity.totals, all },
      daily,
      topTools,
      topLanguages,
      charsProcessed: activity.charsProcessed,
      byClient: { ...activity.byClient },
    };
  }

  /** Per-provider usage for every provider (GET /api/usage). */
  async providerUsage(userId: string): Promise<{ id: string; usage: ProviderUsage }[]> {
    return usageSummariesFor(await this.usage.getAllUsage(userId), this.now());
  }

  async heartbeat(userId: string, version: string): Promise<void> {
    await this.storage.saveExtensionStatus(userId, { lastSeenAt: this.now().toISOString(), version });
  }

  async extensionStatus(userId: string): Promise<ExtensionStatusResponse> {
    const record = await this.storage.getExtensionStatus(userId);
    const online = record ? this.now().getTime() - Date.parse(record.lastSeenAt) <= EXTENSION_ONLINE_MS : false;
    return {
      connected: record !== undefined,
      online,
      lastSeenAt: record?.lastSeenAt ?? null,
      version: record?.version ?? null,
    };
  }
}
