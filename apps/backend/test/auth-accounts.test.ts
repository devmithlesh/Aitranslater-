import { generateKeyPairSync, sign as signBytes } from 'node:crypto';
import request from 'supertest';
import { SESSION_DAYS } from '@verba/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GOOGLE_JWKS_URL } from '../src/services/google';
import { ensureAdminAccount } from '../src/services/auth.service';
import { generateTemporaryPassword, hashPassword, verifyPassword } from '../src/services/password';
import {
  AUTH,
  CHOSEN_PASSWORD,
  as,
  createHarness,
  createUserAccount,
  type Harness,
  jsonResponse,
  mockFetch,
  unexpectedUrl,
} from './helpers';

const DAY_MS = 24 * 60 * 60 * 1000;
const START = new Date(2026, 10, 13, 12, 0, 0);
const GOOGLE_CLIENT = 'test-client-id.apps.googleusercontent.com';
const GEMINI_KEY = 'gem-auth-key-1234567890';
const TRANSLATE = { text: 'Hello', sourceLang: 'en', targetLang: 'es' };
const ADMIN_EMAIL = 'owner@example.com';
const ADMIN_PASSWORD = 'owner-password-1';

/** Every response body the test collected. Used to prove no password hash ever leaves the server. */
const seen: string[] = [];
function record(body: unknown): void {
  seen.push(JSON.stringify(body ?? null));
}

// ── Google test keys ────────────────────────────────────────────────
const signingKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const otherKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = {
  ...(signingKeys.publicKey.export({ format: 'jwk' }) as Record<string, string>),
  kid: 'test-kid',
  alg: 'RS256',
  use: 'sig',
};

function b64url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function signIdToken(
  claims: Record<string, unknown>,
  options: { key?: typeof signingKeys.privateKey; kid?: string; alg?: string } = {},
): string {
  const header = b64url(JSON.stringify({ alg: options.alg ?? 'RS256', kid: options.kid ?? 'test-kid', typ: 'JWT' }));
  const payload = b64url(JSON.stringify(claims));
  const signature = signBytes('RSA-SHA256', Buffer.from(`${header}.${payload}`), options.key ?? signingKeys.privateKey);
  return `${header}.${payload}.${signature.toString('base64url')}`;
}

/** A valid Google ID token claim set, issued at `now`. */
function googleClaims(now: Date, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const nowSec = Math.floor(now.getTime() / 1000);
  return {
    iss: 'https://accounts.google.com',
    aud: GOOGLE_CLIENT,
    sub: 'google-sub-100',
    email: 'pat@example.com',
    email_verified: true,
    name: 'Pat Example',
    iat: nowSec,
    exp: nowSec + 3600,
    ...overrides,
  };
}

/** Serves the test JWKS for Google and fails on any other URL. */
function mockGoogleKeys(cacheControl = 'public, max-age=3600') {
  return mockFetch((url) =>
    url === GOOGLE_JWKS_URL
      ? jsonResponse({ keys: [publicJwk] }, 200, { 'Cache-Control': cacheControl })
      : unexpectedUrl(url),
  );
}

function geminiOk(): Response {
  const text = JSON.stringify({
    meaning: 'Greeting.',
    detectedLanguage: 'en',
    romanized: false,
    variants: { natural: 'Hola' },
  });
  return jsonResponse({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] });
}

describe('password hashing', () => {
  it('stores scrypt hashes in the documented format and verifies them', async () => {
    const stored = await hashPassword('correct horse battery');
    expect(stored).toMatch(/^scrypt\$32768\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(await verifyPassword('correct horse battery', stored)).toBe(true);
    expect(await verifyPassword('correct horse batterx', stored)).toBe(false);
  });

  it('salts every hash, so the same password never gives the same string', async () => {
    const first = await hashPassword('same-password-1');
    const second = await hashPassword('same-password-1');
    expect(first).not.toBe(second);
  });

  it('treats malformed stored values as a mismatch instead of throwing', async () => {
    for (const bad of ['', 'scrypt$', 'bcrypt$1$2$3$AAAA$BBBB', 'scrypt$3$8$1$AAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAA', 'scrypt$32768$8$1$!!$!!']) {
      expect(await verifyPassword('anything-here', bad)).toBe(false);
    }
  });

  it('makes temporary passwords from the unambiguous alphabet', () => {
    const password = generateTemporaryPassword();
    expect(password).toHaveLength(14);
    expect(password).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789]+$/);
  });
});

describe('accounts, sessions and passwords', () => {
  let clock: Date;
  let h: Harness;

  beforeEach(async () => {
    clock = new Date(START);
    h = await createHarness({}, { now: () => clock });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await h.close();
  });

  const signupBody = (overrides: Record<string, string> = {}) => ({
    name: '  Ana  ',
    email: '  Ana@Example.com ',
    password: 'ana-password-1',
    ...overrides,
  });

  describe('public config', () => {
    it('reports signups and the Google client id without a token', async () => {
      const res = await request(h.app).get('/api/auth/config');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ signupsEnabled: true, googleClientId: null });
    });
  });

  describe('signup and login', () => {
    it('signs up, returns a working session, and normalizes the email', async () => {
      const res = await request(h.app).post('/api/auth/signup').send(signupBody());
      expect(res.status).toBe(201);
      record(res.body);
      expect(res.body.token).toMatch(/^vrb_/);
      expect(res.body.expiresAt).toBe(new Date(START.getTime() + SESSION_DAYS * DAY_MS).toISOString());
      expect(res.body.me).toMatchObject({
        name: 'Ana',
        email: 'ana@example.com',
        role: 'user',
        plan: 'free',
        mustChangePassword: false,
        hasPassword: true,
        hasGoogle: false,
      });

      const me = await request(h.app).get('/api/me').set(as(res.body.token));
      expect(me.status).toBe(200);
      record(me.body);
      expect(me.body).toMatchObject({ role: 'user', plan: 'free', hasPassword: true, email: 'ana@example.com' });
    });

    it('answers 409 CONFLICT for an email that is taken, ignoring case', async () => {
      await request(h.app).post('/api/auth/signup').send(signupBody());
      const again = await request(h.app).post('/api/auth/signup').send(signupBody({ email: 'ANA@example.com' }));
      expect(again.status).toBe(409);
      expect(again.body.error).toMatchObject({
        code: 'CONFLICT',
        message: 'An account with this email already exists.',
      });
    });

    it('rejects malformed sign-up bodies with 400', async () => {
      const bad = [
        signupBody({ email: 'not-an-email' }),
        signupBody({ password: 'short' }),
        signupBody({ name: '   ' }),
      ];
      for (const body of bad) {
        const res = await request(h.app).post('/api/auth/signup').send(body);
        expect(res.status, JSON.stringify(body)).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('refuses sign-up with 403 when signups are switched off, and allows it again when on', async () => {
      await request(h.app).put('/api/admin/config').set(AUTH).send({ signupsEnabled: false });
      const config = await request(h.app).get('/api/auth/config');
      expect(config.body.signupsEnabled).toBe(false);

      const off = await request(h.app).post('/api/auth/signup').send(signupBody());
      expect(off.status).toBe(403);
      expect(off.body.error.code).toBe('FORBIDDEN');

      await request(h.app).put('/api/admin/config').set(AUTH).send({ signupsEnabled: true });
      expect((await request(h.app).post('/api/auth/signup').send(signupBody())).status).toBe(201);
    });

    it('logs in with the right password and returns the same profile shape', async () => {
      await request(h.app).post('/api/auth/signup').send(signupBody());
      const res = await request(h.app).post('/api/auth/login').send({ email: 'ANA@example.com', password: 'ana-password-1' });
      expect(res.status).toBe(200);
      record(res.body);
      expect(res.body.token).toMatch(/^vrb_/);
      expect(res.body.me).toMatchObject({ email: 'ana@example.com', role: 'user' });
    });

    it('answers the same 401 for a wrong password and for an unknown email', async () => {
      await request(h.app).post('/api/auth/signup').send(signupBody());
      const wrong = await request(h.app).post('/api/auth/login').send({ email: 'ana@example.com', password: 'nope-nope-nope' });
      const unknown = await request(h.app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'nope-nope-nope' });
      for (const res of [wrong, unknown]) {
        expect(res.status).toBe(401);
        expect(res.body.error).toMatchObject({ code: 'UNAUTHORIZED', message: 'Wrong email or password.' });
      }
    });

    it('answers 401 for a Google-only account asked for a password', async () => {
      mockGoogleKeys();
      await h.close();
      h = await createHarness({ GOOGLE_CLIENT_ID: GOOGLE_CLIENT }, { now: () => clock });
      const google = await request(h.app)
        .post('/api/auth/google')
        .send({ idToken: signIdToken(googleClaims(clock)) });
      expect(google.status).toBe(200);

      const login = await request(h.app).post('/api/auth/login').send({ email: 'pat@example.com', password: 'anything-here' });
      expect(login.status).toBe(401);
      expect(login.body.error.message).toBe('Wrong email or password.');
    });

    it('answers 403 for a disabled account with the right password, and 401 with the wrong one', async () => {
      const user = await createUserAccount(h.app);
      await request(h.app).patch(`/api/admin/users/${user.id}`).set(AUTH).send({ disabled: true });

      const right = await request(h.app).post('/api/auth/login').send({ email: user.email, password: CHOSEN_PASSWORD });
      expect(right.status).toBe(403);
      expect(right.body.error).toMatchObject({ code: 'FORBIDDEN', message: 'This account is disabled.' });

      const wrong = await request(h.app).post('/api/auth/login').send({ email: user.email, password: 'wrong-password-1' });
      expect(wrong.status).toBe(401);
    });
  });

  describe('sessions', () => {
    it('ends the current session on logout and leaves other sessions alone', async () => {
      const first = await request(h.app).post('/api/auth/signup').send(signupBody());
      const second = await request(h.app).post('/api/auth/login').send({ email: 'ana@example.com', password: 'ana-password-1' });

      const out = await request(h.app).post('/api/auth/logout').set(as(first.body.token));
      expect(out.status).toBe(204);
      expect((await request(h.app).get('/api/me').set(as(first.body.token))).status).toBe(401);
      expect((await request(h.app).get('/api/me').set(as(second.body.token))).status).toBe(200);
    });

    it('mints a second working token for the same account', async () => {
      const { token } = await createUserAccount(h.app);
      const minted = await request(h.app).post('/api/auth/sessions').set(as(token));
      expect(minted.status).toBe(201);
      record(minted.body);
      expect(minted.body.token).toMatch(/^vrb_/);
      expect(minted.body.token).not.toBe(token);
      expect(minted.body.expiresAt).toBe(new Date(START.getTime() + SESSION_DAYS * DAY_MS).toISOString());

      expect((await request(h.app).get('/api/me').set(as(minted.body.token))).status).toBe(200);
      expect((await request(h.app).get('/api/me').set(as(token))).status).toBe(200);
    });

    it('expires a session once SESSION_DAYS have passed', async () => {
      const { token } = await createUserAccount(h.app);
      clock = new Date(START.getTime() + (SESSION_DAYS - 1) * DAY_MS);
      expect((await request(h.app).get('/api/me').set(as(token))).status).toBe(200);

      clock = new Date(START.getTime() + (SESSION_DAYS + 1) * DAY_MS);
      const expired = await request(h.app).get('/api/me').set(as(token));
      expect(expired.status).toBe(401);
      expect(expired.body.error.code).toBe('UNAUTHORIZED');
    });

    it('refuses account-only session routes for the server token, but lets it log out as a no-op', async () => {
      const res = await request(h.app).post('/api/auth/sessions').set(AUTH);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');

      const password = await request(h.app)
        .post('/api/auth/change-password')
        .set(AUTH)
        .send({ newPassword: 'new-password-1' });
      expect(password.status).toBe(400);
      expect(password.body.error.message).toBe('Not available for the server token.');

      expect((await request(h.app).post('/api/auth/logout').set(AUTH)).status).toBe(204);
    });
  });

  describe('change password', () => {
    it('rejects a wrong current password, then signs out other sessions on success', async () => {
      const first = await createUserAccount(h.app);
      const second = await request(h.app).post('/api/auth/login').send({ email: first.email, password: CHOSEN_PASSWORD });

      const wrong = await request(h.app)
        .post('/api/auth/change-password')
        .set(as(first.token))
        .send({ currentPassword: 'not-the-password', newPassword: 'brand-new-pass-1' });
      expect(wrong.status).toBe(400);
      expect(wrong.body.error).toMatchObject({ code: 'VALIDATION_ERROR', message: 'Current password is wrong.' });

      const ok = await request(h.app)
        .post('/api/auth/change-password')
        .set(as(first.token))
        .send({ currentPassword: CHOSEN_PASSWORD, newPassword: 'brand-new-pass-1' });
      expect(ok.status).toBe(204);

      expect((await request(h.app).get('/api/me').set(as(second.body.token))).status).toBe(401);
      expect((await request(h.app).get('/api/me').set(as(first.token))).status).toBe(200);
      expect((await request(h.app).post('/api/auth/login').send({ email: first.email, password: CHOSEN_PASSWORD })).status).toBe(401);
      expect((await request(h.app).post('/api/auth/login').send({ email: first.email, password: 'brand-new-pass-1' })).status).toBe(200);
    });

    it('lets a Google-only account add a password without the current one', async () => {
      mockGoogleKeys();
      h = await createHarness({ GOOGLE_CLIENT_ID: GOOGLE_CLIENT }, { now: () => clock });
      const google = await request(h.app)
        .post('/api/auth/google')
        .send({ idToken: signIdToken(googleClaims(clock)) });
      expect(google.body.me).toMatchObject({ hasPassword: false, hasGoogle: true });

      const added = await request(h.app)
        .post('/api/auth/change-password')
        .set(as(google.body.token))
        .send({ newPassword: 'added-password-1' });
      expect(added.status).toBe(204);

      const me = await request(h.app).get('/api/me').set(as(google.body.token));
      expect(me.body).toMatchObject({ hasPassword: true, hasGoogle: true });
    });
  });

  describe('admin-created accounts and resets', () => {
    it('makes a temporary-password user choose a new password before anything else', async () => {
      const created = await request(h.app)
        .post('/api/admin/users')
        .set(AUTH)
        .send({ name: 'New Hire', email: 'hire@example.com' });
      expect(created.status).toBe(201);
      record(created.body);
      expect(created.body.user).toMatchObject({ role: 'user', plan: 'free', mustChangePassword: true, hasPassword: true });
      const temporary = created.body.temporaryPassword as string;

      const login = await request(h.app).post('/api/auth/login').send({ email: 'hire@example.com', password: temporary });
      expect(login.status).toBe(200);
      expect(login.body.me.mustChangePassword).toBe(true);
      const token = login.body.token as string;

      const blocked = await request(h.app).post('/api/translate-variants').set(as(token)).send(TRANSLATE);
      expect(blocked.status).toBe(403);
      expect(blocked.body.error).toMatchObject({ code: 'FORBIDDEN', message: 'Choose a new password first.' });
      expect((await request(h.app).get('/api/settings').set(as(token))).status).toBe(403);

      expect((await request(h.app).get('/api/me').set(as(token))).body.mustChangePassword).toBe(true);
      expect((await request(h.app).get('/api/auth/verify').set(as(token))).status).toBe(200);

      const changed = await request(h.app)
        .post('/api/auth/change-password')
        .set(as(token))
        .send({ currentPassword: temporary, newPassword: 'hire-password-1' });
      expect(changed.status).toBe(204);
      expect((await request(h.app).get('/api/settings').set(as(token))).status).toBe(200);
      expect((await request(h.app).get('/api/me').set(as(token))).body.mustChangePassword).toBe(false);
    });

    it('refuses a duplicate email on admin create with 409', async () => {
      await createUserAccount(h.app, { email: 'dup@example.com' });
      const res = await request(h.app).post('/api/admin/users').set(AUTH).send({ name: 'Again', email: 'DUP@example.com' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('resets a password, signs out every session, and forces a change at next sign-in', async () => {
      const user = await createUserAccount(h.app);
      const second = await request(h.app).post('/api/auth/login').send({ email: user.email, password: CHOSEN_PASSWORD });

      const reset = await request(h.app).post(`/api/admin/users/${user.id}/reset-password`).set(AUTH);
      expect(reset.status).toBe(200);
      record(reset.body);
      expect(reset.body.user).toMatchObject({ id: user.id, mustChangePassword: true });
      expect(reset.body.temporaryPassword).toEqual(expect.any(String));

      expect((await request(h.app).get('/api/me').set(as(user.token))).status).toBe(401);
      expect((await request(h.app).get('/api/me').set(as(second.body.token))).status).toBe(401);
      expect((await request(h.app).post('/api/auth/login').send({ email: user.email, password: CHOSEN_PASSWORD })).status).toBe(401);

      const login = await request(h.app).post('/api/auth/login').send({ email: user.email, password: reset.body.temporaryPassword });
      expect(login.status).toBe(200);
      expect(login.body.me.mustChangePassword).toBe(true);
    });

    it('never returns a password hash in any response', async () => {
      const user = await createUserAccount(h.app);
      const list = await request(h.app).get('/api/admin/users').set(AUTH);
      record(list.body);
      record((await request(h.app).get('/api/me').set(as(user.token))).body);
      record((await request(h.app).post('/api/admin/users/' + user.id + '/reset-password').set(AUTH)).body);

      for (const body of seen) {
        expect(body).not.toContain('scrypt$');
      }
      expect(JSON.stringify(list.body)).not.toContain(user.token);
    });
  });

  describe('admin account and self-protection', () => {
    it('seeds the ADMIN_EMAIL account from env as an unlimited admin', async () => {
      await h.close();
      h = await createHarness(
        { ADMIN_EMAIL: ADMIN_EMAIL, ADMIN_PASSWORD },
        { now: () => clock },
      );
      const login = await request(h.app).post('/api/auth/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
      expect(login.status).toBe(200);
      expect(login.body.me).toMatchObject({ role: 'admin', plan: 'unlimited', mustChangePassword: false });
      expect(login.body.me.credits.limit).toBeNull();
    });

    it('promotes an existing account to admin without overwriting its password', async () => {
      const user = await createUserAccount(h.app, { email: 'promote@example.com' });
      const result = await ensureAdminAccount(h.storage, {
        adminEmail: 'promote@example.com',
        adminPassword: 'env-password-1',
      });
      expect(result).toEqual({ result: 'promoted', email: 'promote@example.com' });
      expect((await ensureAdminAccount(h.storage, { adminEmail: 'promote@example.com', adminPassword: 'env-password-1' })).result).toBe(
        'unchanged',
      );

      const old = await request(h.app).post('/api/auth/login').send({ email: user.email, password: CHOSEN_PASSWORD });
      expect(old.status).toBe(200);
      expect(old.body.me.role).toBe('admin');
      const envPassword = await request(h.app).post('/api/auth/login').send({ email: user.email, password: 'env-password-1' });
      expect(envPassword.status).toBe(401);
    });

    it('stops the admin from deleting, disabling, resetting, or re-planning their own account', async () => {
      await h.close();
      h = await createHarness({ ADMIN_EMAIL: ADMIN_EMAIL, ADMIN_PASSWORD }, { now: () => clock });
      const login = await request(h.app).post('/api/auth/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
      const self = login.body.me.userId as string;
      const token = login.body.token as string;

      const del = await request(h.app).delete(`/api/admin/users/${self}`).set(as(token));
      expect(del.status).toBe(400);
      expect(del.body.error.code).toBe('VALIDATION_ERROR');

      expect((await request(h.app).patch(`/api/admin/users/${self}`).set(as(token)).send({ disabled: true })).status).toBe(400);
      expect((await request(h.app).patch(`/api/admin/users/${self}`).set(as(token)).send({ plan: 'free' })).status).toBe(400);
      expect((await request(h.app).post(`/api/admin/users/${self}/reset-password`).set(as(token))).status).toBe(400);

      expect((await request(h.app).get('/api/me').set(as(token))).status).toBe(200);
    });

    it('keeps user-role accounts out of admin routes after the change', async () => {
      const user = await createUserAccount(h.app);
      const res = await request(h.app).get('/api/admin/users').set(as(user.token));
      expect(res.status).toBe(403);
      expect(res.body.error.message).toBe('Only the admin can do that.');
    });

    it('gives an unlimited plan no daily limit, even with a low default', async () => {
      await request(h.app).put('/api/providers/gemini').set(AUTH).send({ apiKey: GEMINI_KEY });
      await request(h.app).put('/api/admin/config').set(AUTH).send({ defaultDailyLimit: 1 });
      const user = await createUserAccount(h.app);
      const fetchMock = mockFetch((url) => (url.includes('generativelanguage.googleapis.com') ? geminiOk() : unexpectedUrl(url)));

      const patched = await request(h.app).patch(`/api/admin/users/${user.id}`).set(AUTH).send({ plan: 'unlimited' });
      expect(patched.body).toMatchObject({ plan: 'unlimited', effectiveLimit: null });

      for (let i = 0; i < 2; i++) {
        expect((await request(h.app).post('/api/translate-variants').set(as(user.token)).send(TRANSLATE)).status).toBe(200);
      }
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect((await request(h.app).get('/api/me').set(as(user.token))).body.credits).toMatchObject({ limit: null, used: 2 });
    }, 15_000);
  });

  describe('rate limit on sign-in routes', () => {
    it('returns 429 after the configured number of attempts in the window', async () => {
      await h.close();
      h = await createHarness({ AUTH_RATE_LIMIT_PER_15_MIN: '2' }, { now: () => clock });
      const attempt = () => request(h.app).post('/api/auth/login').send({ email: 'x@example.com', password: 'wrong-password-1' });

      expect((await attempt()).status).toBe(401);
      expect((await attempt()).status).toBe(401);
      const limited = await attempt();
      expect(limited.status).toBe(429);
      expect(limited.body.error.code).toBe('RATE_LIMITED');
    });
  });
});

describe('Google sign-in', () => {
  let clock: Date;
  let h: Harness;

  beforeEach(async () => {
    clock = new Date(START);
    h = await createHarness({ GOOGLE_CLIENT_ID: GOOGLE_CLIENT }, { now: () => clock });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await h.close();
  });

  const signIn = (idToken: string) => request(h.app).post('/api/auth/google').send({ idToken });

  it('advertises the client id on the public config', async () => {
    const res = await request(h.app).get('/api/auth/config');
    expect(res.body).toEqual({ signupsEnabled: true, googleClientId: GOOGLE_CLIENT });
  });

  it('creates a new free account from a verified Google token', async () => {
    const jwks = mockGoogleKeys();
    const res = await signIn(signIdToken(googleClaims(clock)));
    expect(res.status).toBe(200);
    record(res.body);
    expect(res.body.me).toMatchObject({
      name: 'Pat Example',
      email: 'pat@example.com',
      role: 'user',
      plan: 'free',
      hasGoogle: true,
      hasPassword: false,
    });
    expect((await request(h.app).get('/api/me').set(as(res.body.token))).status).toBe(200);
    expect(jwks.mock.calls.filter(([url]) => url === GOOGLE_JWKS_URL)).toHaveLength(1);
  });

  it('falls back to the email local part when the token has no name', async () => {
    mockGoogleKeys();
    const res = await signIn(signIdToken(googleClaims(clock, { name: undefined, email: 'sam.lee@example.com', sub: 'sub-2' })));
    expect(res.status).toBe(200);
    expect(res.body.me.name).toBe('sam.lee');
  });

  it('links an existing account with the same email instead of creating a second one', async () => {
    mockGoogleKeys();
    const signup = await request(h.app)
      .post('/api/auth/signup')
      .send({ name: 'Pat', email: 'pat@example.com', password: 'pat-password-1' });
    const linked = await signIn(signIdToken(googleClaims(clock)));
    expect(linked.status).toBe(200);
    expect(linked.body.me).toMatchObject({ userId: signup.body.me.userId, hasGoogle: true, hasPassword: true });
    expect((await h.storage.listUsers()).filter((user) => user.email === 'pat@example.com')).toHaveLength(1);
  });

  it('refuses a new Google account with 403 when signups are off', async () => {
    mockGoogleKeys();
    await request(h.app).put('/api/admin/config').set(AUTH).send({ signupsEnabled: false });
    const res = await signIn(signIdToken(googleClaims(clock)));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('answers 401 for a bad signature, wrong audience, expiry, or unverified email', async () => {
    mockGoogleKeys();
    const bad = [
      signIdToken(googleClaims(clock), { key: otherKeys.privateKey }),
      signIdToken(googleClaims(clock, { aud: 'someone-else.apps.googleusercontent.com' })),
      signIdToken(googleClaims(clock, { exp: Math.floor(clock.getTime() / 1000) - 3600 })),
      signIdToken(googleClaims(clock, { email_verified: false })),
      signIdToken(googleClaims(clock, { iss: 'https://evil.example.com' })),
      signIdToken(googleClaims(clock), { alg: 'HS256' }),
      'not-a-jwt',
    ];
    for (const token of bad) {
      const res = await signIn(token);
      expect(res.status, token.slice(0, 20)).toBe(401);
      expect(res.body.error).toMatchObject({ code: 'UNAUTHORIZED', message: 'Google sign-in failed.' });
    }
  });

  it('answers 503 NO_PROVIDER_CONFIGURED when no client id is set', async () => {
    await h.close();
    h = await createHarness({}, { now: () => clock });
    const res = await request(h.app).post('/api/auth/google').send({ idToken: 'a.b.c' });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatchObject({ code: 'NO_PROVIDER_CONFIGURED', message: 'Google sign-in is not configured.' });
  });

  it('answers 403 for a disabled linked account', async () => {
    mockGoogleKeys();
    const first = await signIn(signIdToken(googleClaims(clock)));
    await request(h.app).patch(`/api/admin/users/${first.body.me.userId}`).set(AUTH).send({ disabled: true });
    const again = await signIn(signIdToken(googleClaims(clock)));
    expect(again.status).toBe(403);
    expect(again.body.error.message).toBe('This account is disabled.');
  });

  it('reuses cached keys within the max-age window', async () => {
    const jwks = mockGoogleKeys('public, max-age=3600');
    expect((await signIn(signIdToken(googleClaims(clock, { sub: 'cache-a', email: 'a@example.com' })))).status).toBe(200);
    expect((await signIn(signIdToken(googleClaims(clock, { sub: 'cache-b', email: 'b@example.com' })))).status).toBe(200);
    expect(jwks.mock.calls.filter(([url]) => url === GOOGLE_JWKS_URL)).toHaveLength(1);
  });

  it('makes sure a JWKS outage is a 401, not a crash', async () => {
    mockFetch(() => new Response('down', { status: 503 }));
    const res = await signIn(signIdToken(googleClaims(clock)));
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Google sign-in failed.');
  });
});
