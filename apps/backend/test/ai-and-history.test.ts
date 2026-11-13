import { readFile } from 'node:fs/promises';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH, createHarness, type Harness, jsonResponse, mockFetch, unexpectedUrl } from './helpers';

const GEMINI_KEY = 'gem-test-key-abcdef';

function geminiText(text: string): Response {
  return jsonResponse({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] });
}

describe('AI tools', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
    await request(h.app).put('/api/providers/gemini').set(AUTH).send({ apiKey: GEMINI_KEY });
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await h.close();
  });

  it('parses fenced grammar JSON and drops issues that are not in the input', async () => {
    mockFetch((url) =>
      url.includes('generativelanguage.googleapis.com')
        ? geminiText(
            '```json\n' +
              JSON.stringify({
                corrected: 'She goes to school.',
                issues: [
                  { type: 'grammar', original: 'goes', replacement: 'goes', explanation: 'no-op' },
                  { type: 'spelling', original: 'not in text', replacement: 'x', explanation: 'bogus' },
                  { type: 'grammar', original: 'She go', replacement: 'She goes', explanation: 'Subject-verb agreement.' },
                ],
              }) +
              '\n```',
          )
        : unexpectedUrl(url),
    );

    const res = await request(h.app).post('/api/grammar').set(AUTH).send({ text: 'She go to school.' });

    expect(res.status).toBe(200);
    expect(res.body.corrected).toBe('She goes to school.');
    expect(res.body.issues).toHaveLength(1);
    expect(res.body.issues[0]).toMatchObject({ type: 'grammar', original: 'She go', replacement: 'She goes' });
    expect(res.body.provider).toBe('gemini');
  });

  it('returns no issues when the corrected text equals the input', async () => {
    mockFetch((url) =>
      url.includes('generativelanguage.googleapis.com')
        ? geminiText(
            JSON.stringify({
              corrected: 'Fine as is.',
              issues: [{ type: 'style', original: 'Fine', replacement: 'Good', explanation: 'x' }],
            }),
          )
        : unexpectedUrl(url),
    );
    const res = await request(h.app).post('/api/grammar').set(AUTH).send({ text: 'Fine as is.' });
    expect(res.status).toBe(200);
    expect(res.body.issues).toEqual([]);
  });

  it('returns 502 when the model output is not usable JSON', async () => {
    mockFetch((url) =>
      url.includes('generativelanguage.googleapis.com') ? geminiText('no json here') : unexpectedUrl(url),
    );
    const res = await request(h.app).post('/api/grammar').set(AUTH).send({ text: 'Hello there.' });
    expect(res.status).toBe(502);
    expect(res.body.error.details[0].provider).toBe('gemini');
  });

  it('runs a built-in assistant tool and records it as assistant activity', async () => {
    mockFetch((url) =>
      url.includes('generativelanguage.googleapis.com') ? geminiText('A short summary.') : unexpectedUrl(url),
    );
    const res = await request(h.app)
      .post('/api/ai-assistant')
      .set(AUTH)
      .send({ text: 'A long text...', toolId: 'summarize' });
    expect(res.status).toBe(200);
    expect(res.body.result).toBe('A short summary.');
    const history = await request(h.app).get('/api/history?type=assistant').set(AUTH);
    expect(history.body.items[0].meta.toolId).toBe('summarize');
  });

  it('requires a prompt for the custom tool', async () => {
    const res = await request(h.app).post('/api/ai-assistant').set(AUTH).send({ text: 'Hi', toolId: 'custom' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown custom assistant', async () => {
    const res = await request(h.app)
      .post('/api/ai-assistant')
      .set(AUTH)
      .send({ text: 'Hi', assistantId: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(404);
  });
});

describe('providers API', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await h.close();
  });

  it('stores the key encrypted, returns only a preview, and never echoes the key', async () => {
    const secret = 'sk-live-super-secret-9876';
    const put = await request(h.app).put('/api/providers/groq').set(AUTH).send({ apiKey: secret, enabled: true });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ id: 'groq', hasApiKey: true, apiKeySource: 'settings', ready: true });
    expect(put.body.apiKeyPreview).toBe('••••9876');
    expect(JSON.stringify(put.body)).not.toContain(secret);

    const list = await request(h.app).get('/api/providers').set(AUTH);
    expect(JSON.stringify(list.body)).not.toContain(secret);
    expect(list.body.items).toHaveLength(12);

    const onDisk = await readFile(`${h.dir}/providers.json`, 'utf8');
    expect(onDisk).not.toContain(secret);
  });

  it('clears a stored key', async () => {
    await request(h.app).put('/api/providers/groq').set(AUTH).send({ apiKey: 'gsk_clearme_0001' });
    const res = await request(h.app).put('/api/providers/groq').set(AUTH).send({ clearApiKey: true });
    expect(res.body.hasApiKey).toBe(false);
    expect(res.body.notReadyReason).toBe('API key required');
  });

  it('returns 404 for an unknown provider id', async () => {
    const res = await request(h.app).put('/api/providers/nope').set(AUTH).send({ enabled: false });
    expect(res.status).toBe(404);
  });

  it('rejects a non-http base URL', async () => {
    const res = await request(h.app).put('/api/providers/ollama').set(AUTH).send({ baseUrl: 'ftp://example.com' });
    expect(res.status).toBe(400);
  });

  it('reports a test failure without throwing and without leaking the key', async () => {
    await request(h.app).put('/api/providers/gemini').set(AUTH).send({ apiKey: GEMINI_KEY });
    mockFetch(() => jsonResponse({ error: { message: 'API key not valid' } }, 400));
    const res = await request(h.app).post('/api/providers/gemini/test').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.message).toContain('HTTP 400');
    expect(res.body.message).not.toContain(GEMINI_KEY);
  });
});

describe('history', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
    mockFetch((url) =>
      url.startsWith('https://api.mymemory.translated.net/get')
        ? jsonResponse({ responseStatus: 200, responseData: { translatedText: 'Hola' } })
        : unexpectedUrl(url),
    );
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await h.close();
  });

  async function translate(text: string): Promise<string> {
    const res = await request(h.app).post('/api/translate').set(AUTH).send({ text, sourceLang: 'en', targetLang: 'es' });
    return res.body.historyId as string;
  }

  it('saves, paginates, searches, favorites, deletes and clears history', async () => {
    const first = await translate('Hello');
    await translate('Good morning');

    const all = await request(h.app).get('/api/history?limit=1').set(AUTH);
    expect(all.body.total).toBe(2);
    expect(all.body.items).toHaveLength(1);
    expect(all.body.items[0].input).toBe('Good morning');
    expect(all.body.nextCursor).toEqual(expect.any(String));

    const second = await request(h.app).get(`/api/history?limit=1&cursor=${all.body.nextCursor}`).set(AUTH);
    expect(second.body.items[0].id).toBe(first);
    expect(second.body.nextCursor).toBeNull();

    const search = await request(h.app).get('/api/history?q=good').set(AUTH);
    expect(search.body.total).toBe(1);

    const fav = await request(h.app).patch(`/api/history/${first}`).set(AUTH).send({ favorite: true });
    expect(fav.body.favorite).toBe(true);
    const favs = await request(h.app).get('/api/history?favorite=true').set(AUTH);
    expect(favs.body.items.map((i: { id: string }) => i.id)).toEqual([first]);

    const del = await request(h.app).delete(`/api/history/${first}`).set(AUTH);
    expect(del.status).toBe(204);
    const missing = await request(h.app).delete(`/api/history/${first}`).set(AUTH);
    expect(missing.status).toBe(404);

    const clear = await request(h.app).delete('/api/history').set(AUTH);
    expect(clear.body).toEqual({ deleted: 1 });
  });

  it('does not save history when saveHistory is off, but still counts stats', async () => {
    await request(h.app).put('/api/settings').set(AUTH).send({ saveHistory: false });
    const historyId = await translate('Hello');
    expect(historyId).toBeUndefined();

    const history = await request(h.app).get('/api/history').set(AUTH);
    expect(history.body.total).toBe(0);

    const stats = await request(h.app).get('/api/stats').set(AUTH);
    expect(stats.body.totals.translate).toBe(1);
    expect(stats.body.totals.all).toBe(1);
    expect(stats.body.topLanguages).toEqual([{ code: 'es', count: 1 }]);
  });

  it('rejects an invalid cursor', async () => {
    const res = await request(h.app).get('/api/history?cursor=%%%').set(AUTH);
    expect(res.status).toBe(400);
  });
});
