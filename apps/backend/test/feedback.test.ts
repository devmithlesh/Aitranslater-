import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH, createHarness, createUserAccount, type Harness, jsonResponse, mockFetch, unexpectedUrl } from './helpers';

describe('POST /api/feedback', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await createHarness();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await h.close();
  });

  it('saves feedback without spending a credit', async () => {
    const res = await request(h.app).post('/api/feedback').set(AUTH).send({ message: '  Please add dark mode  ', category: 'idea' });
    expect(res.status).toBe(201);
    expect(res.body.id).toEqual(expect.any(String));

    const saved = await h.storage.listFeedback(10);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ id: res.body.id, message: 'Please add dark mode', category: 'idea' });

    const me = await request(h.app).get('/api/me').set(AUTH);
    expect(me.body.credits).toMatchObject({ used: 0 });
  });

  it('defaults the category to "idea"', async () => {
    await request(h.app).post('/api/feedback').set(AUTH).send({ message: 'Works great' });
    expect((await h.storage.listFeedback(1))[0]?.category).toBe('idea');
  });

  it('rejects empty, too short, too long and unknown-category feedback', async () => {
    for (const body of [{}, { message: '  ' }, { message: 'hi' }, { message: 'x'.repeat(2001) }, { message: 'valid text', category: 'spam' }]) {
      const res = await request(h.app).post('/api/feedback').set(AUTH).send(body);
      expect(res.status).toBe(400);
    }
    expect(await h.storage.listFeedback(10)).toHaveLength(0);
  });

  it('requires sign-in', async () => {
    const res = await request(h.app).post('/api/feedback').send({ message: 'hello there' });
    expect(res.status).toBe(401);
  });
});

describe('Hinglish target', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
    await request(h.app).put('/api/providers/gemini').set(AUTH).send({ apiKey: 'gem-hinglish-key-abcdef' });
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await h.close();
  });

  it('is accepted and the model is told what Hinglish is', async () => {
    const reply = JSON.stringify({ meaning: 'Greeting.', detectedLanguage: 'en', romanized: false, variants: { professional: 'Namaste, aap kaise hain?' } });
    const fetchMock = mockFetch((url) =>
      url.includes('generativelanguage.googleapis.com')
        ? jsonResponse({ candidates: [{ content: { parts: [{ text: reply }] }, finishReason: 'STOP' }] })
        : unexpectedUrl(url),
    );
    const res = await request(h.app)
      .post('/api/translate-variants')
      .set(AUTH)
      .send({ text: 'Hello, how are you?', sourceLang: 'en', targetLang: 'hinglish', styles: ['professional'] });
    expect(res.status).toBe(200);
    expect(res.body.variants[0].text).toBe('Namaste, aap kaise hain?');
    const sent = String(fetchMock.mock.calls[0][1]?.body);
    expect(sent).toContain('Latin/Roman letters');
  });
});

describe('POST /api/feedback as a normal user', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await createHarness();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await h.close();
  });

  it('lets a regular account send feedback', async () => {
    const { token } = await createUserAccount(h.app, {});
    const res = await request(h.app).post('/api/feedback').set({ Authorization: `Bearer ${token}` }).send({ message: 'Love it, add more languages' });
    expect(res.status).toBe(201);
    expect(await h.storage.listFeedback(10)).toHaveLength(1);
  });

  it('rate limits a flood of feedback', async () => {
    const { token } = await createUserAccount(h.app, {});
    let last = 0;
    for (let i = 0; i < 8; i++) {
      last = (await request(h.app).post('/api/feedback').set({ Authorization: `Bearer ${token}` }).send({ message: `note number ${i}` })).status;
    }
    expect(last).toBe(429);
  });
});

describe('GET /api/admin/feedback', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await createHarness();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await h.close();
  });

  it('lets the admin read the messages with who wrote them, newest first', async () => {
    const { id, token } = await createUserAccount(h.app, {});
    const as = { Authorization: `Bearer ${token}` };
    await request(h.app).post('/api/feedback').set(as).send({ message: 'first thought', category: 'idea' });
    await request(h.app).post('/api/feedback').set(as).send({ message: 'it crashed', category: 'bug' });

    const res = await request(h.app).get('/api/admin/feedback').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.items.map((item: { message: string }) => item.message)).toEqual(['it crashed', 'first thought']);
    const user = await h.storage.getUser(id);
    expect(res.body.items[0]).toMatchObject({ category: 'bug', userName: user?.name, userEmail: user?.email });
  });

  it('shows no name for feedback from an account that no longer exists', async () => {
    await h.storage.insertFeedback({
      id: 'orphan',
      userId: 'gone',
      category: 'other',
      message: 'left before the account was deleted',
      client: 'extension',
      version: null,
      createdAt: new Date().toISOString(),
    });
    const res = await request(h.app).get('/api/admin/feedback').set(AUTH);
    expect(res.body.items[0]).toMatchObject({ id: 'orphan', userName: null, userEmail: null });
  });

  it('is closed to normal accounts and to visitors', async () => {
    const { token } = await createUserAccount(h.app, {});
    expect((await request(h.app).get('/api/admin/feedback').set({ Authorization: `Bearer ${token}` })).status).toBe(403);
    expect((await request(h.app).get('/api/admin/feedback')).status).toBe(401);
    expect((await request(h.app).get('/api/admin/feedback').set({ 'X-Verba-Guest': 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })).status).toBe(401);
  });
});
