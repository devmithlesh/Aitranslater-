import { PROVIDERS } from '@verba/shared';
import type { ActivityType, ClientKind, ProviderId, ProviderUsage } from '@verba/shared';
import { dayKey, monthKey } from '../utils/dates';
import type { ActivityAggregates, ProviderUsageRecord, Storage, UsageBucket } from '../storage/types';

const MAX_DAILY_KEYS = 400;

function emptyActivity(): ActivityAggregates {
  return {
    totals: {
      translate: 0,
      grammar: 0,
      rewrite: 0,
      summarize: 0,
      'smart-reply': 0,
      assistant: 0,
    },
    daily: {},
    languages: {},
    byClient: { web: 0, extension: 0 },
    charsProcessed: 0,
  };
}

function emptyBucket(): UsageBucket {
  return { requests: 0, errors: 0, chars: 0, latencyMs: 0 };
}

function emptyUsageRecord(): ProviderUsageRecord {
  return { daily: {}, monthly: {}, lastUsedAt: null };
}

/** Keeps the newest `max` keys of a day-keyed map (keys are "YYYY-MM-DD", so sorting is chronological). */
function pruneDaily<T>(map: Record<string, T>, max: number): void {
  const keys = Object.keys(map).sort();
  for (const key of keys.slice(0, Math.max(0, keys.length - max))) delete map[key];
}

/** Turns raw buckets into the public ProviderUsage view for "today" and "this month". */
export function summarizeUsage(record: ProviderUsageRecord | undefined, now: Date): ProviderUsage {
  const day = record?.daily[dayKey(now)];
  const month = record?.monthly[monthKey(now)];
  const successes = month ? month.requests - month.errors : 0;
  return {
    requestsToday: day?.requests ?? 0,
    charsToday: day?.chars ?? 0,
    requestsThisMonth: month?.requests ?? 0,
    charsThisMonth: month?.chars ?? 0,
    tokensToday: day?.tokens ?? 0,
    tokensThisMonth: month?.tokens ?? 0,
    errorsThisMonth: month?.errors ?? 0,
    avgLatencyMs: month && successes > 0 ? Math.round(month.latencyMs / successes) : null,
    lastUsedAt: record?.lastUsedAt ?? null,
  };
}

/** One provider call to count. `tokens` is only set when the provider reported a count. */
export interface UsageCall {
  chars: number;
  latencyMs: number;
  ok: boolean;
  tokens?: number;
}

/**
 * Per-provider call counters and activity aggregates. Read-modify-write cycles are
 * serialized in-process so concurrent requests do not lose increments.
 */
export class UsageService {
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly storage: Storage,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async recordCall(userId: string, providerId: ProviderId, call: UsageCall): Promise<void> {
    await this.serialize(async () => {
      const all = await this.storage.getUsage(userId);
      const record = all[providerId] ?? emptyUsageRecord();
      const now = this.now();
      addToBucket(record.daily, dayKey(now), call);
      addToBucket(record.monthly, monthKey(now), call);
      pruneDaily(record.daily, MAX_DAILY_KEYS);
      record.lastUsedAt = now.toISOString();
      await this.storage.saveUsage(userId, providerId, record);
    });
  }

  async recordActivity(
    userId: string,
    client: ClientKind,
    type: ActivityType,
    chars: number,
    languages: string[],
  ): Promise<void> {
    await this.serialize(async () => {
      const aggregates = (await this.storage.getActivity(userId)) ?? emptyActivity();
      const now = this.now();
      const day = dayKey(now);
      const dayCounts = aggregates.daily[day] ?? {};
      dayCounts[type] = (dayCounts[type] ?? 0) + 1;
      aggregates.daily[day] = dayCounts;
      pruneDaily(aggregates.daily, MAX_DAILY_KEYS);

      aggregates.totals[type] += 1;
      aggregates.byClient[client] += 1;
      aggregates.charsProcessed += chars;
      for (const language of languages) {
        if (language) aggregates.languages[language] = (aggregates.languages[language] ?? 0) + 1;
      }
      await this.storage.saveActivity(userId, aggregates);
    });
  }

  async getActivity(userId: string): Promise<ActivityAggregates> {
    return (await this.storage.getActivity(userId)) ?? emptyActivity();
  }

  async getAllUsage(userId: string): Promise<Partial<Record<string, ProviderUsageRecord>>> {
    return this.storage.getUsage(userId);
  }

  private serialize(task: () => Promise<void>): Promise<void> {
    const run = this.queue.then(task);
    this.queue = run.catch(() => undefined);
    return run;
  }
}

function addToBucket(map: Record<string, UsageBucket>, key: string, call: UsageCall): void {
  const bucket = map[key] ?? emptyBucket();
  bucket.requests += 1;
  bucket.chars += call.chars;
  if (call.ok) bucket.latencyMs += call.latencyMs;
  else bucket.errors += 1;
  // Only providers that report tokens create the field, so other buckets keep their shape.
  if (call.tokens) bucket.tokens = (bucket.tokens ?? 0) + call.tokens;
  map[key] = bucket;
}

/** Usage summaries for every known provider (used by GET /api/usage). */
export function usageSummariesFor(
  records: Partial<Record<string, ProviderUsageRecord>>,
  now: Date,
): { id: ProviderId; usage: ProviderUsage }[] {
  return PROVIDERS.map((descriptor) => ({
    id: descriptor.id,
    usage: summarizeUsage(records[descriptor.id], now),
  }));
}
