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
    signupsEnabled: stored?.signupsEnabled ?? true,
    defaultDailyLimit: stored?.defaultDailyLimit ?? null,
    providerDailyQuotas: { ...(stored?.providerDailyQuotas ?? {}) },
  };
}

/**
 * The limit a user actually lives under. Admins and "unlimited" plans have none (null). Everyone else gets
 * their override, else the server default. null = unlimited.
 */
export function effectiveLimit(user: StoredUser, config: StoredAppConfig): number | null {
  if (user.role === 'admin' || user.plan === 'unlimited') return null;
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

/** Counter id for all guests together. */
const GUEST_GLOBAL_ID = 'guestglobal';

/** Day the credit was reserved on. Pass it back to refund() so a request that crosses midnight refunds the right day. */
export interface Reservation {
  day: string;
  /** The counters that were charged (a guest is charged on two). Absent means just the account. */
  ledgerIds?: string[];
}

/** Free prompts for visitors without an account. */
export interface GuestLimits {
  dailyLimit: number;
  ipDailyLimit: number;
  /** All guests together, per day. 0 means no cap. */
  globalDailyLimit: number;
}

/** Daily translation credits. The admin is unlimited but still counted. */
export class CreditsService {
  /** Shared with UsersService so user record writes and credit writes never interleave. */
  readonly lock = new Serializer();

  constructor(
    private readonly storage: Storage,
    private readonly now: () => Date = () => new Date(),
    private readonly guestLimits: GuestLimits = { dailyLimit: 0, ipDailyLimit: 0, globalDailyLimit: 0 },
  ) {}

  async status(auth: AuthContext): Promise<CreditStatus> {
    const now = this.now();
    const limit = await this.limitFor(auth);
    const ledger = await this.storage.getCredits(auth.userId);
    const used = ledger?.daily[dayKey(now)] ?? 0;
    let remaining = limit === null ? null : Math.max(0, limit - used);
    if (auth.guest && remaining !== null) {
      // The shared per-IP counter can run out before the install's own, so show whichever is smaller.
      const ipLedger = await this.storage.getCredits(auth.guest.ipKey);
      const ipUsed = ipLedger?.daily[dayKey(now)] ?? 0;
      remaining = Math.min(remaining, Math.max(0, this.guestLimits.ipDailyLimit - ipUsed));
    }
    return {
      limit,
      used,
      remaining,
      resetsAt: nextMidnight(now).toISOString(),
    };
  }

  /** Takes one credit or throws CREDIT_LIMIT_REACHED (429). A guest is counted per install and per IP. */
  reserve(auth: AuthContext): Promise<Reservation> {
    return this.lock.run(async () => {
      const limit = await this.limitFor(auth);
      const now = this.now();
      const day = dayKey(now);
      const targets: Array<{ id: string; limit: number | null }> = [{ id: auth.userId, limit }];
      if (auth.guest) {
        targets.push({ id: auth.guest.ipKey, limit: this.guestLimits.ipDailyLimit });
        if (this.guestLimits.globalDailyLimit > 0) targets.push({ id: GUEST_GLOBAL_ID, limit: this.guestLimits.globalDailyLimit });
      }

      // Check every counter first, so a refusal charges none of them.
      const ledgers: CreditLedger[] = [];
      for (const target of targets) {
        const ledger: CreditLedger = (await this.storage.getCredits(target.id)) ?? { daily: {}, total: 0 };
        const used = ledger.daily[day] ?? 0;
        if (target.limit !== null && used >= target.limit) {
          const ownLimit = target.id === auth.userId;
          const message = auth.guest
            ? ownLimit
              ? `You have used your ${limit} free prompts for today. Sign in to keep going.`
              : 'Free prompts are used up on this network today. Sign in to keep going.'
            : `Daily limit reached (${used}/${target.limit}). Credits reset at midnight.`;
          throw new AppError('CREDIT_LIMIT_REACHED', 429, message, {
            resetsAt: nextMidnight(now).toISOString(),
            limit: auth.guest ? (ownLimit ? limit : null) : target.limit,
            used: auth.guest ? (ownLimit ? limit : used) : used,
            ...(auth.guest ? { guest: true } : {}),
          });
        }
        ledgers.push(ledger);
      }
      const before = ledgers.map((ledger) => structuredClone(ledger));
      let saved = 0;
      try {
        for (const [i, target] of targets.entries()) {
          const ledger = ledgers[i] as CreditLedger;
          const used = ledger.daily[day] ?? 0;
          // Guest counters only ever matter for today, so older days are dropped to keep them tiny.
          if (auth.guest) ledger.daily = {};
          ledger.daily[day] = used + 1;
          ledger.total += 1;
          await this.storage.saveCredits(target.id, ledger);
          saved += 1;
        }
      } catch (err) {
        // One counter could not be saved: put back the ones that were, so nothing is charged for a failed request.
        for (let i = 0; i < saved; i++) {
          await this.storage.saveCredits((targets[i] as { id: string }).id, before[i] as CreditLedger).catch(() => undefined);
        }
        throw err;
      }
      return { day, ledgerIds: targets.map((target) => target.id) };
    });
  }

  /** Gives back a credit reserved for a request that failed. Never goes below zero. */
  refund(auth: AuthContext, reservation: Reservation): Promise<void> {
    return this.lock.run(async () => {
      for (const id of reservation.ledgerIds ?? [auth.userId]) {
        const ledger = await this.storage.getCredits(id);
        if (!ledger) continue;
        const used = ledger.daily[reservation.day] ?? 0;
        if (used <= 0) continue;
        ledger.daily[reservation.day] = used - 1;
        ledger.total = Math.max(0, ledger.total - 1);
        await this.storage.saveCredits(id, ledger);
      }
    });
  }

  /** Records the last successful use of an account. The server token has no stored record, so this is a no-op for it. */
  markUsed(auth: AuthContext): Promise<void> {
    // Visitors have no stored account to stamp, and this runs inside the lock every credit call shares.
    if (auth.serverToken || auth.guest) return Promise.resolve();
    return this.lock.run(async () => {
      const user = await this.storage.getUser(auth.userId);
      if (!user) return;
      await this.storage.saveUser({ ...user, lastUsedAt: this.now().toISOString() });
    });
  }

  private async limitFor(auth: AuthContext): Promise<number | null> {
    if (auth.guest) return this.guestLimits.dailyLimit;
    if (auth.role === 'admin') return null;
    const user = await this.storage.getUser(auth.userId);
    if (!user) throw unauthorized();
    return effectiveLimit(user, await readAppConfig(this.storage));
  }
}
