import { randomUUID } from 'node:crypto';
import type { CreateUserRequest, UpdateUserRequest, UserPasswordResponse, UserView } from '@verba/shared';
import type { AuthContext } from '../middleware/auth';
import type { Storage, StoredAppConfig, StoredUser } from '../storage/types';
import { badRequest, conflict, notFound } from '../utils/errors';
import { hashPassword, generateTemporaryPassword } from './password';
import { type CreditsService, effectiveLimit, ledgerTotals, readAppConfig } from './credits.service';

/** Admin-managed accounts. Passwords are only ever shown once, as a temporary password. */
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

  /** New accounts start on the free plan and must choose their own password at first sign-in. */
  async create(input: CreateUserRequest): Promise<UserPasswordResponse> {
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    return this.credits.lock.run(async () => {
      if (await this.storage.findUserByEmail(input.email)) {
        throw conflict('An account with this email already exists.');
      }
      const user: StoredUser = {
        id: randomUUID(),
        name: input.name,
        email: input.email,
        passwordHash,
        googleSub: null,
        role: 'user',
        plan: 'free',
        mustChangePassword: true,
        disabled: false,
        dailyLimit: input.dailyLimit ?? null,
        createdAt: this.now().toISOString(),
        lastUsedAt: null,
      };
      await this.storage.saveUser(user);
      return { user: await this.view(user, await readAppConfig(this.storage)), temporaryPassword };
    });
  }

  async update(id: string, patch: UpdateUserRequest, caller: AuthContext): Promise<UserView> {
    return this.credits.lock.run(async () => {
      const user = await this.require(id);
      if (isSelf(caller, id)) {
        if (patch.disabled === true) throw badRequest('You cannot disable your own account.');
        if (patch.plan !== undefined && patch.plan !== user.plan) throw badRequest('You cannot change your own plan.');
      }
      const next: StoredUser = {
        ...user,
        name: patch.name ?? user.name,
        disabled: patch.disabled ?? user.disabled,
        plan: patch.plan ?? user.plan,
        dailyLimit: patch.dailyLimit !== undefined ? patch.dailyLimit : user.dailyLimit,
      };
      await this.storage.saveUser(next);
      return this.view(next, await readAppConfig(this.storage));
    });
  }

  /** Sets a new temporary password, requires a change at next use, and signs out every session of the account. */
  async resetPassword(id: string, caller: AuthContext): Promise<UserPasswordResponse> {
    if (isSelf(caller, id)) throw badRequest('You cannot reset your own password here. Use change-password instead.');
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    return this.credits.lock.run(async () => {
      const user = await this.require(id);
      const next: StoredUser = { ...user, passwordHash, mustChangePassword: true };
      await this.storage.saveUser(next);
      await this.storage.deleteUserSessions(id);
      return { user: await this.view(next, await readAppConfig(this.storage)), temporaryPassword };
    });
  }

  async remove(id: string, caller: AuthContext): Promise<void> {
    if (isSelf(caller, id)) throw badRequest('You cannot delete your own account.');
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

  /** Never includes the password hash. */
  private async view(user: StoredUser, config: StoredAppConfig): Promise<UserView> {
    const totals = ledgerTotals(await this.storage.getCredits(user.id), this.now());
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      plan: user.plan,
      mustChangePassword: user.mustChangePassword,
      hasPassword: user.passwordHash !== null,
      hasGoogle: user.googleSub !== null,
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

/** True when the admin is acting on their own account (the server token has no account). */
function isSelf(caller: AuthContext, id: string): boolean {
  return !caller.serverToken && caller.userId === id;
}
