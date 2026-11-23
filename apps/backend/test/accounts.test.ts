import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH, createHarness, createUserAccount, type Harness, jsonResponse, mockFetch, unexpectedUrl } from './helpers';

const GEMINI_KEY = 'gem-accounts-key-123456';
const START = new Date(2026, 10, 13, 12, 0, 0);
const NEXT_DAY = new Date(2026, 10, 14, 0, 0, 1);
const NEXT_MIDNIGHT = new Date(2026, 10, 14).toISOString();
const TRANSLATE = { text: 'Hello', sourceLang: 'en', targetLang: 'es' };

const as = (token: string) => ({ Authorization: `Bearer ${token}` });

function geminiOk(): Response {
  const text = JSON.stringify({
    meaning: 'Greeting.',
    detectedLanguage: 'en',
    romanized: false,
    variants: { natural: 'Hola' },
  });
  return jsonResponse({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] });
}

/** Mocks Gemini with a successful answer. Any other URL fails the test. */
function geminiMock() {
  return mockFetch((url) => (url.includes('generativelanguage.googleapis.com') ? geminiOk() : unexpectedUrl(url)));
}

describe('accounts, roles and daily credits', () => {
  let clock: Date;
  let h: Harness;

  beforeEach(async () => {
    clock = new Date(START);
    h = await createHarness({}, { now: () => clock });
    await request(h.app).put('/api/providers/gemini').set(AUTH).send({ apiKey: GEMINI_KEY });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await h.close();
  });

  describe('identity', () => {
    it('describes the admin on verify and /me', async () => {
      const verify = await request(h.app).get('/api/auth/verify').set(AUTH);
      expect(verify.status).toBe(200);
      expect(verify.body).toMatchObject({ ok: true, userId: 'local', role: 'admin', name: 'Admin', email: null, plan: 'unlimited' });

      const me = await request(h.app).get('/api/me').set(AUTH);
      expect(me.status).toBe(200);
      expect(me.body).toMatchObject({ userId: 'local', name: 'Admin', role: 'admin', email: null, plan: 'unlimited' });
      expect(me.body.credits).toEqual({ limit: null, used: 0, remaining: null, resetsAt: NEXT_MIDNIGHT });
    });

    it('lets a created user verify and read /me with their own token', async () => {
      const { id, token } = await createUserAccount(h.app, { name: 'Friend' });

      const verify = await request(h.app).get('/api/auth/verify').set(as(token));
      expect(verify.status).toBe(200);
      expect(verify.body).toMatchObject({
        ok: true,
        userId: id,
        role: 'user',
        name: 'Friend',
        plan: 'free',
        hasPassword: true,
        hasGoogle: false,
        mustChangePassword: false,
      });

      const me = await request(h.app).get('/api/me').set(as(token));
      expect(me.status).toBe(200);
      expect(me.body).toMatchObject({ userId: id, name: 'Friend', role: 'user' });
      expect(me.body.credits).toMatchObject({ limit: null, used: 0, remaining: null });
    });

    it('never returns the token from the admin user list', async () => {
      const { token } = await createUserAccount(h.app);
      const list = await request(h.app).get('/api/admin/users').set(AUTH);
      expect(list.status).toBe(200);
      expect(JSON.stringify(list.body)).not.toContain(token);
    });

    it('rejects a wrong token with 401', async () => {
      const res = await request(h.app).get('/api/me').set('Authorization', 'Bearer vrb_not_a_real_token_value');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('role gate', () => {
    it('answers 403 FORBIDDEN on admin-only routes for a user', async () => {
      const { token } = await createUserAccount(h.app);
      const denied = [
        request(h.app).get('/api/providers').set(as(token)),
        request(h.app).get('/api/admin/users').set(as(token)),
        request(h.app).get('/api/admin/usage').set(as(token)),
        request(h.app).get('/api/admin/config').set(as(token)),
        request(h.app).get('/api/stats').set(as(token)),
        request(h.app).get('/api/stats').set(as(token)),
        request(h.app).post('/api/translate').set(as(token)).send(TRANSLATE),
        request(h.app).post('/api/admin/users').set(as(token)).send({ name: 'Nope' }),
      ];
      for (const res of await Promise.all(denied)) {
        expect(res.status).toBe(403);
        expect(res.body.error).toMatchObject({ code: 'FORBIDDEN', message: 'Only the admin can do that.' });
      }
    });

    it('lets a user use their own settings, assistants and extension heartbeat', async () => {
      const { token } = await createUserAccount(h.app);
      expect((await request(h.app).get('/api/settings').set(as(token))).status).toBe(200);
      expect((await request(h.app).put('/api/settings').set(as(token)).send({ defaultTargetLang: 'fr' })).status).toBe(200);
      expect((await request(h.app).get('/api/assistants').set(as(token))).status).toBe(200);
      expect(
        (await request(h.app).post('/api/extension/heartbeat').set(as(token)).send({ version: '0.1.0' })).status,
      ).toBe(204);
    });

    it('keeps user settings separate from the admin settings', async () => {
      const { token } = await createUserAccount(h.app);
      await request(h.app).put('/api/settings').set(as(token)).send({ defaultTargetLang: 'fr' });
      const admin = await request(h.app).get('/api/settings').set(AUTH);
      expect(admin.body.defaultTargetLang).toBe('hi');
      const user = await request(h.app).get('/api/settings').set(as(token));
      expect(user.body.defaultTargetLang).toBe('fr');
    });

    it('answers 403 for unknown routes when a user calls them', async () => {
      const { token } = await createUserAccount(h.app);
      const res = await request(h.app).get('/api/nope').set(as(token));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('token lifecycle', () => {
    it('locks a disabled user out of every route, including /me, and re-enables them', async () => {
      const { id, token } = await createUserAccount(h.app);
      const disabled = await request(h.app).patch(`/api/admin/users/${id}`).set(AUTH).send({ disabled: true });
      expect(disabled.status).toBe(200);
      expect(disabled.body.disabled).toBe(true);

      const message = 'This account is disabled.';
      for (const res of [
        await request(h.app).get('/api/auth/verify').set(as(token)),
        await request(h.app).get('/api/me').set(as(token)),
        await request(h.app).get('/api/settings').set(as(token)),
        await request(h.app).post('/api/translate-variants').set(as(token)).send(TRANSLATE),
      ]) {
        expect(res.status).toBe(403);
        expect(res.body.error).toMatchObject({ code: 'FORBIDDEN', message });
      }

      await request(h.app).patch(`/api/admin/users/${id}`).set(AUTH).send({ disabled: false });
      expect((await request(h.app).get('/api/me').set(as(token))).status).toBe(200);
    });

    it('revokes access when the user is deleted', async () => {
      const { id, token } = await createUserAccount(h.app);
      const deleted = await request(h.app).delete(`/api/admin/users/${id}`).set(AUTH);
      expect(deleted.status).toBe(204);

      expect((await request(h.app).get('/api/me').set(as(token))).status).toBe(401);
      expect((await request(h.app).delete(`/api/admin/users/${id}`).set(AUTH)).status).toBe(404);
      expect((await request(h.app).patch(`/api/admin/users/${id}`).set(AUTH).send({ name: 'x' })).status).toBe(404);
      expect((await request(h.app).post(`/api/admin/users/${id}/reset-password`).set(AUTH)).status).toBe(404);
    });
  });

  describe('translation credits', () => {
    it('runs a user translation with the admin Gemini key and records it under the user', async () => {
      const { id, token } = await createUserAccount(h.app);
      const fetchMock = geminiMock();

      const res = await request(h.app).post('/api/translate-variants').set(as(token)).send(TRANSLATE);
      expect(res.status).toBe(200);
      expect(res.body.provider).toBe('gemini');
      expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ 'x-goog-api-key': GEMINI_KEY });

      // The activity is counted under the user (not the admin), and no text is kept.
      expect((await h.storage.getActivity(id))?.totals.translate).toBe(1);
      expect((await h.storage.getActivity('local'))?.totals.translate ?? 0).toBe(0);

      const me = await request(h.app).get('/api/me').set(as(token));
      expect(me.body.credits).toMatchObject({ used: 1 });
    });

    it('enforces a daily limit of 2, returns 429 with the reset time, and resets at midnight', async () => {
      const { token } = await createUserAccount(h.app, { dailyLimit: 2 });
      const fetchMock = geminiMock();

      expect((await request(h.app).post('/api/translate-variants').set(as(token)).send(TRANSLATE)).status).toBe(200);
      expect((await request(h.app).post('/api/translate-variants').set(as(token)).send(TRANSLATE)).status).toBe(200);

      const blocked = await request(h.app).post('/api/translate-variants').set(as(token)).send(TRANSLATE);
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe('CREDIT_LIMIT_REACHED');
      expect(blocked.body.error.message).toContain('Daily limit reached (2/2)');
      expect(blocked.body.error.details).toEqual({ resetsAt: NEXT_MIDNIGHT, limit: 2, used: 2 });
      expect(fetchMock).toHaveBeenCalledTimes(2);

      const me = await request(h.app).get('/api/me').set(as(token));
      expect(me.body.credits).toEqual({ limit: 2, used: 2, remaining: 0, resetsAt: NEXT_MIDNIGHT });

      clock = NEXT_DAY;
      expect((await request(h.app).post('/api/translate-variants').set(as(token)).send(TRANSLATE)).status).toBe(200);
      const after = await request(h.app).get('/api/me').set(as(token));
      expect(after.body.credits).toMatchObject({ used: 1, remaining: 1 });
    });

    it('does not spend a credit on a request that fails validation', async () => {
      const { token } = await createUserAccount(h.app, { dailyLimit: 1 });
      const res = await request(h.app).post('/api/translate-variants').set(as(token)).send({ text: '   ' });
      expect(res.status).toBe(400);
      const me = await request(h.app).get('/api/me').set(as(token));
      expect(me.body.credits).toMatchObject({ used: 0, remaining: 1 });
    });

    it('refunds the credit when the AI call fails', async () => {
      const { token } = await createUserAccount(h.app, { dailyLimit: 1 });
      mockFetch(() => new Response('{"error":{"message":"boom"}}', { status: 500 }));

      const failed = await request(h.app).post('/api/translate-variants').set(as(token)).send(TRANSLATE);
      expect(failed.status).toBe(502);
      expect(failed.body.error.code).toBe('PROVIDER_ERROR');

      const me = await request(h.app).get('/api/me').set(as(token));
      expect(me.body.credits).toMatchObject({ used: 0, remaining: 1 });

      geminiMock();
      expect((await request(h.app).post('/api/translate-variants').set(as(token)).send(TRANSLATE)).status).toBe(200);
    });

    it('applies the default limit when the user has no override, and follows overrides when set', async () => {
      const { id, token } = await createUserAccount(h.app);
      await request(h.app).put('/api/admin/config').set(AUTH).send({ defaultDailyLimit: 1 });
      geminiMock();

      const me = await request(h.app).get('/api/me').set(as(token));
      expect(me.body.credits).toMatchObject({ limit: 1 });
      expect((await request(h.app).post('/api/translate-variants').set(as(token)).send(TRANSLATE)).status).toBe(200);
      expect((await request(h.app).post('/api/translate-variants').set(as(token)).send(TRANSLATE)).status).toBe(429);

      await request(h.app).patch(`/api/admin/users/${id}`).set(AUTH).send({ dailyLimit: 3 });
      expect((await request(h.app).get('/api/me').set(as(token))).body.credits).toMatchObject({ limit: 3, used: 1 });

      await request(h.app).patch(`/api/admin/users/${id}`).set(AUTH).send({ dailyLimit: null });
      expect((await request(h.app).get('/api/me').set(as(token))).body.credits).toMatchObject({ limit: 1 });
    });

    it('leaves the admin unlimited but still counts every admin translation', async () => {
      await request(h.app).put('/api/admin/config').set(AUTH).send({ defaultDailyLimit: 1 });
      geminiMock();
      for (let i = 0; i < 3; i++) {
        expect((await request(h.app).post('/api/translate-variants').set(AUTH).send(TRANSLATE)).status).toBe(200);
      }
      const me = await request(h.app).get('/api/me').set(AUTH);
      expect(me.body.credits).toEqual({ limit: null, used: 3, remaining: null, resetsAt: NEXT_MIDNIGHT });
    });
  });

  describe('admin users and usage', () => {
    it('lists users newest first with usage and effective limits', async () => {
      const first = await createUserAccount(h.app, { name: 'First' });
      clock = new Date(START.getTime() + 60_000);
      await createUserAccount(h.app, { name: 'Second', dailyLimit: 7 });
      geminiMock();
      await request(h.app).post('/api/translate-variants').set(as(first.token)).send(TRANSLATE);

      const res = await request(h.app).get('/api/admin/users').set(AUTH);
      expect(res.status).toBe(200);
      expect(res.body.items.map((user: { name: string }) => user.name)).toEqual(['Second', 'First']);
      expect(res.body.items[0]).toMatchObject({ name: 'Second', dailyLimit: 7, effectiveLimit: 7, usedToday: 0 });
      expect(res.body.items[1]).toMatchObject({
        id: first.id,
        dailyLimit: null,
        effectiveLimit: null,
        usedToday: 1,
        usedThisMonth: 1,
        totalUsed: 1,
        disabled: false,
      });
      expect(res.body.items[1].lastUsedAt).toEqual(expect.any(String));
    });

    it('reports translations today and active users on /admin/usage', async () => {
      const user = await createUserAccount(h.app, { name: 'Active' });
      await createUserAccount(h.app, { name: 'Idle' });
      geminiMock();
      await request(h.app).post('/api/translate-variants').set(AUTH).send(TRANSLATE);
      await request(h.app).post('/api/translate-variants').set(as(user.token)).send(TRANSLATE);
      await request(h.app).post('/api/translate-variants').set(as(user.token)).send(TRANSLATE);

      const res = await request(h.app).get('/api/admin/usage').set(AUTH);
      expect(res.status).toBe(200);
      expect(res.body.translations).toMatchObject({ today: 3, thisMonth: 3 });
      expect(res.body.translations.daily).toHaveLength(14);
      expect(res.body.translations.daily[13]).toEqual({ day: '2026-11-13', value: 3 });
      expect(res.body.translations.daily[12]).toEqual({ day: '2026-11-12', value: 0 });
      expect(res.body.totalUsers).toBe(2);
      expect(res.body.activeUsersToday).toBe(2);

      const gemini = res.body.providers.find((p: { id: string }) => p.id === 'gemini');
      expect(gemini).toMatchObject({ name: expect.any(String), ready: true, dailyQuota: null });
      expect(gemini.dailyRequests).toHaveLength(14);
      expect(gemini.dailyRequests[13]).toEqual({ day: '2026-11-13', value: 3 });
      expect(gemini.dailyTokens).toHaveLength(14);
    });

    it('round-trips the provider quota and default limit through /admin/config', async () => {
      expect((await request(h.app).get('/api/admin/config').set(AUTH)).body).toEqual({
        signupsEnabled: true,
        defaultDailyLimit: null,
        providerDailyQuotas: {},
      });

      const set = await request(h.app)
        .put('/api/admin/config')
        .set(AUTH)
        .send({ defaultDailyLimit: 5, providerDailyQuotas: { gemini: 1000 } });
      expect(set.status).toBe(200);
      expect(set.body).toEqual({ signupsEnabled: true, defaultDailyLimit: 5, providerDailyQuotas: { gemini: 1000 } });
      expect((await request(h.app).get('/api/admin/config').set(AUTH)).body).toEqual(set.body);
      const usage = await request(h.app).get('/api/admin/usage').set(AUTH);
      expect(usage.body.providers.find((p: { id: string }) => p.id === 'gemini').dailyQuota).toBe(1000);

      // The sent object replaces the map; a null entry removes that provider.
      const replaced = await request(h.app)
        .put('/api/admin/config')
        .set(AUTH)
        .send({ providerDailyQuotas: { gemini: 500, groq: null } });
      expect(replaced.body).toEqual({ signupsEnabled: true, defaultDailyLimit: 5, providerDailyQuotas: { gemini: 500 } });

      const cleared = await request(h.app).put('/api/admin/config').set(AUTH).send({ providerDailyQuotas: {}, defaultDailyLimit: null });
      expect(cleared.body).toEqual({ signupsEnabled: true, defaultDailyLimit: null, providerDailyQuotas: {} });
    });

    it('keeps admin routes and config closed to users', async () => {
      const { token } = await createUserAccount(h.app);
      expect((await request(h.app).put('/api/admin/config').set(as(token)).send({ defaultDailyLimit: 1 })).status).toBe(403);
    });
  });

  describe('validation', () => {
    it('rejects bad user bodies with 400', async () => {
      const bad = [
        { name: '   ' },
        { name: 'x'.repeat(61) },
        { name: 'ok', email: 'ok@example.com', dailyLimit: -1 },
        { name: 'ok', email: 'ok@example.com', dailyLimit: 100_001 },
        { name: 'ok', email: 'ok@example.com', dailyLimit: 1.5 },
        { name: 'ok', email: 'ok@example.com', dailyLimit: '5' },
        { name: 'ok', email: 'not-an-email' },
        { name: 'ok' },
      ];
      for (const body of bad) {
        const res = await request(h.app).post('/api/admin/users').set(AUTH).send(body);
        expect(res.status, JSON.stringify(body)).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }

      const { id } = await createUserAccount(h.app);
      const patch = await request(h.app).patch(`/api/admin/users/${id}`).set(AUTH).send({ dailyLimit: 'abc' });
      expect(patch.status).toBe(400);
      expect(patch.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects bad admin config bodies with 400, including unknown provider ids', async () => {
      const bad = [
        { defaultDailyLimit: 100_001 },
        { defaultDailyLimit: -5 },
        { providerDailyQuotas: { nope: 5 } },
        { providerDailyQuotas: { gemini: 0 } },
        { providerDailyQuotas: { gemini: 10_000_001 } },
      ];
      for (const body of bad) {
        const res = await request(h.app).put('/api/admin/config').set(AUTH).send(body);
        expect(res.status, JSON.stringify(body)).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
    });
  });
});
