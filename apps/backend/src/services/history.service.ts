import { randomUUID } from 'node:crypto';
import { DEFAULT_SETTINGS } from '@verba/shared';
import type { ActivityType, ClientKind, HistoryItem, HistoryListResponse } from '@verba/shared';
import { badRequest } from '../utils/errors';
import { clip } from '../utils/text';
import type { Storage } from '../storage/types';
import type { UsageService } from './usage.service';

/** Input and output are capped when stored; the live response is not truncated. */
export const MAX_STORED_CHARS = 20_000;

const DAY_MS = 24 * 60 * 60 * 1000;

export function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): number {
  const text = Buffer.from(cursor, 'base64url').toString('utf8');
  if (!/^\d+$/.test(text)) throw badRequest('Invalid cursor.');
  return Number(text);
}

export interface RecordActivityInput {
  userId: string;
  client: ClientKind;
  type: ActivityType;
  input: string;
  output: string;
  meta: HistoryItem['meta'];
  /** Language codes to count in stats (translation target and detected source). */
  languages: string[];
  chars: number;
  saveHistory: boolean;
}

export interface HistoryQueryInput {
  type?: ActivityType;
  q?: string;
  favorite?: boolean;
  limit: number;
  cursor?: string;
}

export class HistoryService {
  constructor(
    private readonly storage: Storage,
    private readonly usage: UsageService,
  ) {}

  /** Records aggregates always; saves the item only when saveHistory is on. Returns the history id if saved. */
  async record(input: RecordActivityInput): Promise<string | undefined> {
    await this.usage.recordActivity(input.userId, input.client, input.type, input.chars, input.languages);
    if (!input.saveHistory) return undefined;

    const item: HistoryItem = {
      id: randomUUID(),
      type: input.type,
      input: clip(input.input, MAX_STORED_CHARS),
      output: clip(input.output, MAX_STORED_CHARS),
      meta: input.meta,
      client: input.client,
      favorite: false,
      createdAt: new Date().toISOString(),
    };
    await this.storage.insertHistory(input.userId, item);
    return item.id;
  }

  async list(userId: string, query: HistoryQueryInput): Promise<HistoryListResponse> {
    const offset = query.cursor ? decodeCursor(query.cursor) : 0;
    const q = query.q?.trim() || undefined;
    const page = await this.storage.queryHistory(userId, {
      type: query.type,
      q,
      favorite: query.favorite,
      offset,
      limit: query.limit,
    });
    const next = offset + page.items.length;
    return {
      items: page.items,
      total: page.total,
      nextCursor: next < page.total ? encodeCursor(next) : null,
    };
  }

  setFavorite(userId: string, id: string, favorite: boolean): Promise<HistoryItem | undefined> {
    return this.storage.setHistoryFavorite(userId, id, favorite);
  }

  remove(userId: string, id: string): Promise<boolean> {
    return this.storage.deleteHistoryItem(userId, id);
  }

  clear(userId: string): Promise<number> {
    return this.storage.clearHistory(userId);
  }
}

/** Deletes expired, non-favorite history for every user according to historyRetentionDays. */
export async function pruneExpiredHistory(storage: Storage, now: Date = new Date()): Promise<number> {
  let removed = 0;
  for (const userId of await storage.listUserIds()) {
    const settings = await storage.getSettings(userId);
    const days = settings?.historyRetentionDays ?? DEFAULT_SETTINGS.historyRetentionDays;
    if (days <= 0) continue;
    const cutoff = new Date(now.getTime() - days * DAY_MS).toISOString();
    removed += await storage.pruneHistory(userId, cutoff);
  }
  return removed;
}
