import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH, createHarness, type Harness, jsonResponse, mockFetch, unexpectedUrl } from './helpers';

const GUEST = { 'X-Verba-Guest': 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' };
const OTHER_GUEST = { 'X-Verba-Guest': 'ffffffff-0000-1111-2222-333333333333' };
const GEMINI_KEY = 'gem-guest-key-abcdef';

function geminiText(text: string): Response {
  return jsonResponse({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] });
}

function mockGemini(text = 'An answer.') {
  return mockFetch((url) => (url.includes('generativelanguage.googleapis.com') ? geminiText(text) : unexpectedUrl(url)));
}

describe('guest access (5 free prompts a day without an account)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await createHarness({ GUEST_DAILY_LIMIT: '5', GUEST_IP_DAILY_LIMIT: '8' });
    await request(h.app).put('/api/providers/gemini').set(AUTH).send({ apiKey: GEMINI_KEY });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await h.close();
  });

  it('lets a visitor ask 5 times, then answers 429 with a sign-in message', async () => {
    mockGemini();
    for (let i = 0; i < 5; i++) {
      const ok = await request(h.app).post('/api/write').set(GUEST).send({ prompt: `question ${i}` });
      expect(ok.status).toBe(200);
    }
    const sixth = await request(h.app).post('/api/write').set(GUEST).send({ prompt: 'one more' });
    expect(sixth.status).toBe(429);
    expect(sixth.body.error.code).toBe('CREDIT_LIMIT_REACHED');
    expect(sixth.body.error.message).toContain('Sign in');
    expect(sixth.body.error.details).toMatchObject({ guest: true, limit: 5 });
  });

  it('reports the remaining free prompts', async () => {
    mockGemini();
    await request(h.app).post('/api/write').set(GUEST).send({ prompt: 'hello there' });
    const res = await request(h.app).get('/api/guest/credits').set(GUEST);
    expect(res.status).toBe(200);
    expect(res.body.credits).toMatchObject({ limit: 5, used: 1, remaining: 4 });
  });

  it('gives the prompt back when the AI call fails', async () => {
    mockFetch(() => jsonResponse({ error: 'down' }, 500));
    const failed = await request(h.app).post('/api/write').set(GUEST).send({ prompt: 'will fail' });
    expect(failed.status).toBeGreaterThanOrEqual(500);
    const res = await request(h.app).get('/api/guest/credits').set(GUEST);
    expect(res.body.credits).toMatchObject({ used: 0, remaining: 5 });
  });

  it('counts each install separately, but caps the whole IP', async () => {
    mockGemini();
    for (let i = 0; i < 5; i++) await request(h.app).post('/api/write').set(GUEST).send({ prompt: `q${i}` });
    // A second install on the same IP still has its own 5, until the IP cap (8) is used up.
    for (let i = 0; i < 3; i++) {
      expect((await request(h.app).post('/api/write').set(OTHER_GUEST).send({ prompt: `r${i}` })).status).toBe(200);
    }
    const blocked = await request(h.app).post('/api/write').set(OTHER_GUEST).send({ prompt: 'over the IP cap' });
    expect(blocked.status).toBe(429);
  });

  it('only opens the three prompt routes to visitors', async () => {
    mockGemini();
    for (const [method, path] of [
      ['get', '/api/me'],
      ['get', '/api/settings'],
      ['get', '/api/stats'],
      ['post', '/api/feedback'],
      ['post', '/api/translate'],
      ['post', '/api/explain'],
      ['get', '/api/admin/users'],
    ] as const) {
      const res = await request(h.app)[method](path).set(GUEST).send({ text: 'hello', message: 'a long enough feedback' });
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });

  it('rejects a malformed install id and a missing one', async () => {
    mockGemini();
    expect((await request(h.app).post('/api/write').set({ 'X-Verba-Guest': 'short' }).send({ prompt: 'hi there' })).status).toBe(401);
    expect((await request(h.app).post('/api/write').send({ prompt: 'hi there' })).status).toBe(401);
  });

  it('keeps no history or usage rows for visitors', async () => {
    mockGemini();
    await request(h.app).post('/api/write').set(GUEST).send({ prompt: 'private question' });
    // Not even usage rows are kept under a visitor's id.
    expect(await h.storage.getActivity(`guest:${GUEST['X-Verba-Guest']}`)).toBeUndefined();
  });

  it('can be switched off with GUEST_DAILY_LIMIT=0', async () => {
    const off = await createHarness({ GUEST_DAILY_LIMIT: '0' });
    try {
      const res = await request(off.app).post('/api/write').set(GUEST).send({ prompt: 'hello there' });
      expect(res.status).toBe(401);
    } finally {
      await off.close();
    }
  });
});

describe('guest limits: network and global caps', () => {
  let h: Harness | undefined;

  afterEach(async () => {
    vi.unstubAllGlobals();
    await h?.close();
    h = undefined;
  });

  async function start(env: Record<string, string>) {
    h = await createHarness(env);
    await request(h.app).put('/api/providers/gemini').set(AUTH).send({ apiKey: GEMINI_KEY });
    mockGemini();
    return h;
  }

  it('shows the smaller of the install and network allowance', async () => {
    const app = await start({ GUEST_DAILY_LIMIT: '5', GUEST_IP_DAILY_LIMIT: '2' });
    const res = await request(app.app).get('/api/guest/credits').set(GUEST);
    expect(res.body.credits).toMatchObject({ limit: 5, remaining: 2 });
  });

  it('says the network is used up, not "your 5", when only the IP cap is hit', async () => {
    const app = await start({ GUEST_DAILY_LIMIT: '5', GUEST_IP_DAILY_LIMIT: '1' });
    expect((await request(app.app).post('/api/write').set(GUEST).send({ prompt: 'first one' })).status).toBe(200);
    const blocked = await request(app.app).post('/api/write').set(OTHER_GUEST).send({ prompt: 'second install' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.message).toContain('network');
    expect(blocked.body.error.details).toMatchObject({ guest: true, limit: null });
  });

  it('stops all guests together at the global daily budget', async () => {
    const app = await start({ GUEST_DAILY_LIMIT: '5', GUEST_IP_DAILY_LIMIT: '50', GUEST_GLOBAL_DAILY_LIMIT: '3' });
    for (let i = 0; i < 2; i++) await request(app.app).post('/api/write').set(GUEST).send({ prompt: `a${i}` });
    expect((await request(app.app).post('/api/write').set(OTHER_GUEST).send({ prompt: 'third overall' })).status).toBe(200);
    const blocked = await request(app.app).post('/api/write').set({ 'X-Verba-Guest': '99999999-aaaa-bbbb-cccc-dddddddddddd' }).send({ prompt: 'over budget' });
    expect(blocked.status).toBe(429);
  });

  it('does not let a signed-in account be counted as a guest', async () => {
    const app = await start({ GUEST_DAILY_LIMIT: '1' });
    expect((await request(app.app).post('/api/write').set(AUTH).set(GUEST).send({ prompt: 'one' })).status).toBe(200);
    expect((await request(app.app).post('/api/write').set(AUTH).set(GUEST).send({ prompt: 'two' })).status).toBe(200);
  });
});

describe('ipGroup', () => {
  it('keeps IPv4, unwraps IPv4-mapped addresses and groups IPv6 by its /64', async () => {
    const { ipGroup } = await import('../src/middleware/auth');
    expect(ipGroup('203.0.113.9')).toBe('203.0.113.9');
    expect(ipGroup('::ffff:203.0.113.9')).toBe('203.0.113.9');
    const a = ipGroup('2001:db8:1:2:aaaa:bbbb:cccc:dddd');
    const b = ipGroup('2001:0db8:0001:0002::1');
    expect(a).toBe('2001:0db8:0001:0002');
    expect(b).toBe(a);
    expect(ipGroup('2001:db8:1:3::1')).not.toBe(a);
  });
});
