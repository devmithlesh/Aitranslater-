import { randomUUID } from 'node:crypto';
import type { CreateUserRequest, UpdateUserRequest, UserTokenResponse, UserView } from '@verba/shared';
import type { Storage, StoredAppConfig, StoredUser } from '../storage/types';
import { generateAccessToken, sha256Hex } from '../utils/crypto';
import { notFound } from '../utils/errors';
import { type CreditsService, effectiveLimit, ledgerTotals, readAppConfig } from './credits.service';

/** Admin-managed accounts. Tokens are shown once and only their sha256 digest is stored. */
export class UsersService {
  constructor(
    private readonly storage: Storage,
    private readonly credits: CreditsService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Newest first. */
  async list(): Promise<UserView[]> {
    const [users, config] = await Promise.all([this.storage.listUsers(), readAppConfig(this.storage)]);
    const views = await Promise.all(users.map((user) => this.view(user, config)));
    return views.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async create(input: CreateUserRequest): Promise<UserTokenResponse> {
    const token = generateAccessToken();
    const user: StoredUser = {
      id: randomUUID(),
      name: input.name,
      tokenHash: sha256Hex(token),
      disabled: false,
      dailyLimit: input.dailyLimit ?? null,
      createdAt: this.now().toISOString(),
      lastUsedAt: null,
    };
    return this.credits.lock.run(async () => {
      await this.storage.saveUser(user);
      return { user: await this.view(user, await readAppConfig(this.storage)), token };
    });
  }

  async update(id: string, patch: UpdateUserRequest): Promise<UserView> {
    return this.credits.lock.run(async () => {
      const user = await this.require(id);
      const next: StoredUser = {
        ...user,
        name: patch.name ?? user.name,
        disabled: patch.disabled ?? user.disabled,
        dailyLimit: patch.dailyLimit !== undefined ? patch.dailyLimit : user.dailyLimit,
      };
      await this.storage.saveUser(next);
      return this.view(next, await readAppConfig(this.storage));
    });
  }

  /** Issues a new token. The previous token stops working immediately. */
  async regenerateToken(id: string): Promise<UserTokenResponse> {
    const token = generateAccessToken();
    return this.credits.lock.run(async () => {
      const user = await this.require(id);
      const next: StoredUser = { ...user, tokenHash: sha256Hex(token) };
      await this.storage.saveUser(next);
      return { user: await this.view(next, await readAppConfig(this.storage)), token };
    });
  }

  async remove(id: string): Promise<void> {
    await this.credits.lock.run(async () => {
      await this.require(id);
      await this.storage.deleteUser(id);
    });
  }

  private async require(id: string): Promise<StoredUser> {
    const user = await this.storage.getUser(id);
    if (!user) throw notFound('No user with that id.');
    return user;
  }

  private async view(user: StoredUser, config: StoredAppConfig): Promise<UserView> {
    const totals = ledgerTotals(await this.storage.getCredits(user.id), this.now());
    return {
      id: user.id,
      name: user.name,
      disabled: user.disabled,
      dailyLimit: user.dailyLimit,
      effectiveLimit: effectiveLimit(user, config),
      usedToday: totals.usedToday,
      usedThisMonth: totals.usedThisMonth,
      totalUsed: totals.totalUsed,
      lastUsedAt: user.lastUsedAt,
      createdAt: user.createdAt,
    };
  }
}
