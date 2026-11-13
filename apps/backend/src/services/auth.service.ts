import { randomUUID } from 'node:crypto';
import { NAME_MAX_LENGTH } from '@verba/shared';
import type {
  AuthConfigResponse,
  AuthSessionResponse,
  ChangePasswordRequest,
  LoginRequest,
  MeResponse,
  NewSessionResponse,
  SignupRequest,
} from '@verba/shared';
import type { AppConfig } from '../config/env';
import { ADMIN_NAME, LOCAL_USER_ID, type AuthContext } from '../middleware/auth';
import type { Storage, StoredUser } from '../storage/types';
import { badRequest, conflict, forbidden, notConfigured, unauthorized } from '../utils/errors';
import { type CreditsService, readAppConfig } from './credits.service';
import { type FetchImpl, type GoogleIdentity, GoogleKeyCache, verifyGoogleIdToken } from './google';
import { dummyVerify, hashPassword, verifyPassword } from './password';
import { SessionsService } from './sessions.service';

const BAD_LOGIN = 'Wrong email or password.';
const DISABLED = 'This account is disabled.';
const EMAIL_TAKEN = 'An account with this email already exists.';
const SIGNUPS_OFF = 'Sign-ups are turned off.';
const SERVER_TOKEN = 'Not available for the server token.';
const WRONG_CURRENT = 'Current password is wrong.';
const GOOGLE_NOT_CONFIGURED = 'Google sign-in is not configured.';
const GOOGLE_FAILED = 'Google sign-in failed.';

/** The account part of MeResponse (everything except credits). Also returned by GET /auth/verify. */
export type AccountProfile = Omit<MeResponse, 'credits'>;

/** Builds the auth context a stored account would have on a fresh session. */
function contextFor(user: StoredUser, sessionId: string | null): AuthContext {
  return {
    userId: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
    sessionId,
    user,
    serverToken: false,
  };
}

/** Name for a new Google account: the Google profile name, else the email's local part. */
function googleAccountName(identity: GoogleIdentity): string {
  const fromProfile = identity.name?.trim() ?? '';
  const fallback = identity.email.split('@')[0]?.trim() ?? '';
  const name = fromProfile || fallback || 'Google user';
  return name.slice(0, NAME_MAX_LENGTH);
}

/** Sign-up, sign-in, sessions, password changes and the caller's profile. */
export class AuthService {
  private readonly sessions: SessionsService;
  private readonly googleKeys = new GoogleKeyCache();
  private readonly fetchImpl: FetchImpl = (input, init) => fetch(input, init);

  constructor(
    private readonly config: AppConfig,
    private readonly storage: Storage,
    private readonly credits: CreditsService,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.sessions = new SessionsService(storage, now);
  }

  async authConfig(): Promise<AuthConfigResponse> {
    const config = await readAppConfig(this.storage);
    return { signupsEnabled: config.signupsEnabled ?? true, googleClientId: this.config.googleClientId };
  }

  async signup(input: SignupRequest): Promise<AuthSessionResponse> {
    if (!(await readAppConfig(this.storage)).signupsEnabled) throw forbidden(SIGNUPS_OFF);
    const passwordHash = await hashPassword(input.password);
    const user = await this.credits.lock.run(async () => {
      if (await this.storage.findUserByEmail(input.email)) throw conflict(EMAIL_TAKEN);
      const created: StoredUser = {
        id: randomUUID(),
        name: input.name,
        email: input.email,
        passwordHash,
        googleSub: null,
        role: 'user',
        plan: 'free',
        mustChangePassword: false,
        disabled: false,
        dailyLimit: null,
        createdAt: this.now().toISOString(),
        lastUsedAt: null,
      };
      await this.storage.saveUser(created);
      return created;
    });
    return this.startSession(user);
  }

  async login(input: LoginRequest): Promise<AuthSessionResponse> {
    const user = await this.storage.findUserByEmail(input.email);
    const hash = user?.passwordHash;
    if (!user || !hash) {
      // Same work as a real check, so the response time does not reveal which emails exist.
      await dummyVerify(input.password);
      throw unauthorized(BAD_LOGIN);
    }
    if (!(await verifyPassword(input.password, hash))) throw unauthorized(BAD_LOGIN);
    if (user.disabled) throw forbidden(DISABLED);
    return this.startSession(user);
  }

  /** Verifies the Google ID token, then finds, links or creates the account. */
  async google(idToken: string): Promise<AuthSessionResponse> {
    const clientId = this.config.googleClientId;
    if (!clientId) throw notConfigured(GOOGLE_NOT_CONFIGURED);
    const identity = await verifyGoogleIdToken(idToken, clientId, {
      fetchImpl: this.fetchImpl,
      now: this.now,
      keys: this.googleKeys,
    });
    const user = await this.credits.lock.run(() => this.accountForGoogle(identity));
    if (user.disabled) throw forbidden(DISABLED);
    return this.startSession(user);
  }

  /** Ends the current session. The server token has no session, so this does nothing for it. */
  async logout(auth: AuthContext): Promise<void> {
    if (auth.sessionId) await this.sessions.revoke(auth.sessionId);
  }

  /**
   * Replaces the password and signs out every other session. The current password must be right when
   * the account already has one. A Google-only account can add a password without it.
   */
  async changePassword(auth: AuthContext, input: ChangePasswordRequest): Promise<void> {
    if (auth.serverToken || !auth.user) throw badRequest(SERVER_TOKEN);
    const current = await this.storage.getUser(auth.userId);
    if (!current) throw unauthorized();
    if (current.passwordHash !== null) {
      const matches =
        input.currentPassword !== undefined && (await verifyPassword(input.currentPassword, current.passwordHash));
      if (!matches) throw badRequest(WRONG_CURRENT);
    }
    const passwordHash = await hashPassword(input.newPassword);
    await this.credits.lock.run(async () => {
      const latest = await this.storage.getUser(auth.userId);
      if (!latest) throw unauthorized();
      await this.storage.saveUser({ ...latest, passwordHash, mustChangePassword: false });
    });
    await this.storage.deleteUserSessions(auth.userId, auth.sessionId ?? undefined);
  }

  /** Mints an extra session for the caller, e.g. for the Chrome extension. */
  async newSession(auth: AuthContext): Promise<NewSessionResponse> {
    if (auth.serverToken || !auth.user) throw badRequest(SERVER_TOKEN);
    const issued = await this.sessions.create(auth.userId);
    return { token: issued.token, expiresAt: issued.expiresAt };
  }

  /** Account fields for the caller. The server token is described as an unlimited admin with no email. */
  profile(auth: AuthContext): AccountProfile {
    const user = auth.user;
    if (auth.serverToken || !user) {
      return {
        userId: LOCAL_USER_ID,
        name: ADMIN_NAME,
        email: null,
        role: 'admin',
        plan: 'unlimited',
        mustChangePassword: false,
        hasPassword: false,
        hasGoogle: false,
      };
    }
    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      plan: user.plan,
      mustChangePassword: user.mustChangePassword,
      hasPassword: user.passwordHash !== null,
      hasGoogle: user.googleSub !== null,
    };
  }

  async me(auth: AuthContext): Promise<MeResponse> {
    return { ...this.profile(auth), credits: await this.credits.status(auth) };
  }

  private async startSession(user: StoredUser): Promise<AuthSessionResponse> {
    const issued = await this.sessions.create(user.id);
    return {
      token: issued.token,
      expiresAt: issued.expiresAt,
      me: await this.me(contextFor(user, issued.session.id)),
    };
  }

  /** Runs under the shared lock so two first sign-ins with the same Google account cannot create two accounts. */
  private async accountForGoogle(identity: GoogleIdentity): Promise<StoredUser> {
    const bySub = await this.storage.findUserByGoogleSub(identity.sub);
    if (bySub) return bySub;

    const byEmail = await this.storage.findUserByEmail(identity.email);
    if (byEmail) {
      // The email already belongs to a different Google account.
      if (byEmail.googleSub !== null) throw unauthorized(GOOGLE_FAILED);
      const linked: StoredUser = { ...byEmail, googleSub: identity.sub };
      await this.storage.saveUser(linked);
      return linked;
    }

    if (!(await readAppConfig(this.storage)).signupsEnabled) throw forbidden(SIGNUPS_OFF);
    const created: StoredUser = {
      id: randomUUID(),
      name: googleAccountName(identity),
      email: identity.email,
      passwordHash: null,
      googleSub: identity.sub,
      role: 'user',
      plan: 'free',
      mustChangePassword: false,
      disabled: false,
      dailyLimit: null,
      createdAt: this.now().toISOString(),
      lastUsedAt: null,
    };
    await this.storage.saveUser(created);
    return created;
  }
}

export type AdminSeedResult = 'skipped' | 'created' | 'promoted' | 'unchanged' | 'missing-password';

/**
 * Makes sure the ADMIN_EMAIL account exists and is an admin. A new account needs ADMIN_PASSWORD. An existing
 * account is promoted but its password is never changed. Never logs the password.
 */
export async function ensureAdminAccount(
  storage: Storage,
  config: Pick<AppConfig, 'adminEmail' | 'adminPassword'>,
  now: () => Date = () => new Date(),
): Promise<{ result: AdminSeedResult; email: string | null }> {
  const email = config.adminEmail;
  if (!email) return { result: 'skipped', email: null };

  const existing = await storage.findUserByEmail(email);
  if (!existing) {
    if (!config.adminPassword) return { result: 'missing-password', email };
    const admin: StoredUser = {
      id: randomUUID(),
      name: ADMIN_NAME,
      email,
      passwordHash: await hashPassword(config.adminPassword),
      googleSub: null,
      role: 'admin',
      plan: 'unlimited',
      mustChangePassword: false,
      disabled: false,
      dailyLimit: null,
      createdAt: now().toISOString(),
      lastUsedAt: null,
    };
    await storage.saveUser(admin);
    return { result: 'created', email };
  }

  if (existing.role !== 'admin') {
    await storage.saveUser({ ...existing, role: 'admin' });
    return { result: 'promoted', email };
  }
  return { result: 'unchanged', email };
}
