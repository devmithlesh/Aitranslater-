import type { CreditStatus } from '@verba/shared';
import type { AuthContext } from '../middleware/auth';
import type { CreditLedger, Storage, StoredAppConfig, StoredUser } from '../storage/types';
import { dayKey, monthKey } from '../utils/dates';
import { AppError, unauthorized } from '../utils/errors';

/** Runs tasks one at a time, so read-modify-write cycles on credits and user records cannot interleave. */
export class Serializer {
  private queue: Promise<void> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

/** Stored server-wide config with defaults applied. */
export async function readAppConfig(storage: Storage): Promise<StoredAppConfig> {
  const stored = await storage.getAppConfig();
  return {
    defaultDailyLimit: stored?.defaultDailyLimit ?? null,
    providerDailyQuotas: { ...(stored?.providerDailyQuotas ?? {}) },
  };
}

/** The limit a user actually lives under: their override, else the server default. null = unlimited. */
export function effectiveLimit(user: StoredUser, config: StoredAppConfig): number | null {
  return user.dailyLimit ?? config.defaultDailyLimit;
}

/** Next local midnight after `now`. */
export function nextMidnight(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
}

export interface LedgerTotals {
  usedToday: number;
  usedThisMonth: number;
  totalUsed: number;
}

export function ledgerTotals(ledger: CreditLedger | undefined, now: Date): LedgerTotals {
  const daily = ledger?.daily ?? {};
  const monthPrefix = `${monthKey(now)}-`;
  let usedThisMonth = 0;
  for (const [day, count] of Object.entries(daily)) {
    if (day.startsWith(monthPrefix)) usedThisMonth += count;
  }
  return { usedToday: daily[dayKey(now)] ?? 0, usedThisMonth, totalUsed: ledger?.total ?? 0 };
}

/** Day the credit was reserved on. Pass it back to refund() so a request that crosses midnight refunds the right day. */
export interface Reservation {
  day: string;
}

/** Daily translation credits. The admin is unlimited but still counted. */
export class CreditsService {
  /** Shared with UsersService so user record writes and credit writes never interleave. */
  readonly lock = new Serializer();

  constructor(
    private readonly storage: Storage,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async status(auth: AuthContext): Promise<CreditStatus> {
    const now = this.now();
    const limit = await this.limitFor(auth);
    const ledger = await this.storage.getCredits(auth.userId);
    const used = ledger?.daily[dayKey(now)] ?? 0;
    return {
      limit,
      used,
      remaining: limit === null ? null : Math.max(0, limit - used),
      resetsAt: nextMidnight(now).toISOString(),
    };
  }

  /** Takes one credit or throws CREDIT_LIMIT_REACHED (429). */
  reserve(auth: AuthContext): Promise<Reservation> {
    return this.lock.run(async () => {
      const limit = await this.limitFor(auth);
      const now = this.now();
      const day = dayKey(now);
      const ledger: CreditLedger = (await this.storage.getCredits(auth.userId)) ?? { daily: {}, total: 0 };
      const used = ledger.daily[day] ?? 0;
      if (limit !== null && used >= limit) {
        throw new AppError(
          'CREDIT_LIMIT_REACHED',
          429,
          `Daily limit reached (${used}/${limit}). Credits reset at midnight.`,
          { resetsAt: nextMidnight(now).toISOString(), limit, used },
        );
      }
      ledger.daily[day] = used + 1;
      ledger.total += 1;
      await this.storage.saveCredits(auth.userId, ledger);
      return { day };
    });
  }

  /** Gives back a credit reserved for a request that failed. Never goes below zero. */
  refund(auth: AuthContext, reservation: Reservation): Promise<void> {
    return this.lock.run(async () => {
      const ledger = await this.storage.getCredits(auth.userId);
      if (!ledger) return;
      const used = ledger.daily[reservation.day] ?? 0;
      if (used <= 0) return;
      ledger.daily[reservation.day] = used - 1;
      ledger.total = Math.max(0, ledger.total - 1);
      await this.storage.saveCredits(auth.userId, ledger);
    });
  }

  /** Records the last successful use of a user account. The admin has no stored record, so this is a no-op for it. */
  markUsed(auth: AuthContext): Promise<void> {
    if (auth.role !== 'user') return Promise.resolve();
    return this.lock.run(async () => {
      const user = await this.storage.getUser(auth.userId);
      if (!user) return;
      await this.storage.saveUser({ ...user, lastUsedAt: this.now().toISOString() });
    });
  }

  private async limitFor(auth: AuthContext): Promise<number | null> {
    if (auth.role === 'admin') return null;
    const user = await this.storage.getUser(auth.userId);
    if (!user) throw unauthorized();
    return effectiveLimit(user, await readAppConfig(this.storage));
  }
}
