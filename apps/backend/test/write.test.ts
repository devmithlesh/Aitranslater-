import { WRITE_PROMPT_MAX_LENGTH } from '@verba/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH, createHarness, createUserAccount, type Harness, jsonResponse, mockFetch, unexpectedUrl } from './helpers';

const GEMINI_KEY = 'gem-write-key-abcdef';
const LETTER = 'Dear [Manager],\n\nI am writing to request leave from 12 to 13 November.\n\nRegards,\n[Your Name]';

function geminiText(text: string): Response {
  return jsonResponse({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] });
}

/** Mocks Gemini with a plain-text letter. Any other URL fails the test. */
function geminiLetter() {
  return mockFetch((url) => (url.includes('generativelanguage.googleapis.com') ? geminiText(LETTER) : unexpectedUrl(url)));
}

const as = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('POST /api/write', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await createHarness();
    await request(h.app).put('/api/providers/gemini').set(AUTH).send({ apiKey: GEMINI_KEY });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await h.close();
  });

  it('returns the written content and charges one credit', async () => {
    const fetchMock = geminiLetter();

    const res = await request(h.app)
      .post('/api/write')
      .set(AUTH)
      .send({ prompt: 'can you write leave application for 2 days', targetLang: 'hi' });

    expect(res.status).toBe(200);
    expect(res.body.result).toBe(LETTER);
    expect(res.body.provider).toBe('gemini');
    expect(res.body.historyId).toEqual(expect.any(String));
    expect(res.body.latencyMs).toEqual(expect.any(Number));
    expect(JSON.stringify(res.body)).not.toContain(GEMINI_KEY);

    const sent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      systemInstruction: { parts: { text: string }[] };
      generationConfig: { temperature: number; maxOutputTokens: number };
    };
    expect(sent.systemInstruction.parts[0].text).toContain('Hindi');
    expect(sent.generationConfig.temperature).toBe(0.6);
    expect(sent.generationConfig.maxOutputTokens).toBeGreaterThanOrEqual(700);

    const me = await request(h.app).get('/api/me').set(AUTH);
    expect(me.body.credits).toMatchObject({ used: 1 });
  });

  it('rejects an empty prompt with 400 and does not spend a credit', async () => {
    const res = await request(h.app).post('/api/write').set(AUTH).send({ prompt: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');

    const me = await request(h.app).get('/api/me').set(AUTH);
    expect(me.body.credits).toMatchObject({ used: 0 });
  });

  it(`rejects a prompt longer than ${WRITE_PROMPT_MAX_LENGTH} characters with 400`, async () => {
    const res = await request(h.app)
      .post('/api/write')
      .set(AUTH)
      .send({ prompt: 'x'.repeat(WRITE_PROMPT_MAX_LENGTH + 1) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts a prompt of exactly the maximum length', async () => {
    geminiLetter();
    const res = await request(h.app)
      .post('/api/write')
      .set(AUTH)
      .send({ prompt: 'x'.repeat(WRITE_PROMPT_MAX_LENGTH) });
    expect(res.status).toBe(200);
  });

  it('returns 401 without a session token', async () => {
    const fetchMock = geminiLetter();
    const res = await request(h.app).post('/api/write').send({ prompt: 'write a thank you note' });
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refunds the credit when the AI call fails', async () => {
    mockFetch(() => new Response('{"error":{"message":"boom"}}', { status: 500 }));

    const failed = await request(h.app).post('/api/write').set(AUTH).send({ prompt: 'write a complaint letter' });
    expect(failed.status).toBe(502);
    expect(failed.body.error.code).toBe('PROVIDER_ERROR');

    const me = await request(h.app).get('/api/me').set(AUTH);
    expect(me.body.credits).toMatchObject({ used: 0 });
  });

  // Needs a non-admin account: the admin is unlimited. Non-admin accounts can reach /write only once
  // POST /write is listed in USER_ROUTES (middleware/auth.ts); until then this test gets 403.
  it('returns the same out-of-credits error as translate-variants', async () => {
    const { token } = await createUserAccount(h.app, { dailyLimit: 1 });
    geminiLetter();
    expect((await request(h.app).post('/api/write').set(as(token)).send({ prompt: 'write a note' })).status).toBe(200);

    const write = await request(h.app).post('/api/write').set(as(token)).send({ prompt: 'write a note' });
    const translate = await request(h.app)
      .post('/api/translate-variants')
      .set(as(token))
      .send({ text: 'Hello', sourceLang: 'en', targetLang: 'es' });

    expect(write.status).toBe(429);
    expect(write.body.error.code).toBe('CREDIT_LIMIT_REACHED');
    expect(write.body.error.message).toContain('Daily limit reached (1/1)');
    expect(translate.status).toBe(write.status);
    expect(translate.body.error.code).toBe(write.body.error.code);
    expect(translate.body.error.message).toBe(write.body.error.message);
  });
});
