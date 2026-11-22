import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
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

  it('explains text in Hinglish by default and records it as explain activity', async () => {
    const fetchMock = mockFetch((url) =>
      url.includes('generativelanguage.googleapis.com')
        ? geminiText('**In short:** Company ne profit kamaya.')
        : unexpectedUrl(url),
    );
    const res = await request(h.app).post('/api/explain').set(AUTH).send({ text: 'Q3 revenue rose 12%.' });
    expect(res.status).toBe(200);
    expect(res.body.result).toBe('**In short:** Company ne profit kamaya.');
    expect(res.body.provider).toBe('gemini');

    const sent = String(fetchMock.mock.calls[0][1]?.body);
    expect(sent).toContain('Write in Hinglish');

    const stats = await request(h.app).get('/api/stats').set(AUTH);
    expect(stats.body.totals.assistant).toBe(1);
  });

  it('explains text in a supported language code such as Tamil', async () => {
    mockFetch((url) => (url.includes('generativelanguage.googleapis.com') ? geminiText('**In short:** சுருக்கம்.') : unexpectedUrl(url)));
    const res = await request(h.app).post('/api/explain').set(AUTH).send({ text: 'Hello', language: 'ta' });
    expect(res.status).toBe(200);
  });

  it('rejects an unsupported explain language', async () => {
    const res = await request(h.app).post('/api/explain').set(AUTH).send({ text: 'Hello', language: 'klingon' });
    expect(res.status).toBe(400);
  });

  it('rejects empty explain text', async () => {
    const res = await request(h.app).post('/api/explain').set(AUTH).send({ text: '   ' });
    expect(res.status).toBe(400);
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

describe('no history is kept', () => {
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

  it('counts the translation in the stats but saves neither the text nor a history id', async () => {
    const res = await request(h.app).post('/api/translate').set(AUTH).send({ text: 'Hello', sourceLang: 'en', targetLang: 'es' });
    expect(res.status).toBe(200);
    expect(res.body.historyId).toBeUndefined();

    const stats = await request(h.app).get('/api/stats').set(AUTH);
    expect(stats.body.totals.translate).toBe(1);
    expect(stats.body.totals.all).toBe(1);
    expect(stats.body.topLanguages).toEqual([{ code: 'es', count: 1 }]);
    expect(stats.body.recent).toBeUndefined();
    expect(JSON.stringify(stats.body)).not.toContain('Hello');
  });

  it('has no history routes any more', async () => {
    for (const [method, path] of [
      ['get', '/api/history'],
      ['patch', '/api/history/abc'],
      ['delete', '/api/history/abc'],
      ['delete', '/api/history'],
    ] as const) {
      const res = await request(h.app)[method](path).set(AUTH);
      expect(res.status, `${method} ${path}`).toBe(404);
    }
  });

  it('does not write a history file', async () => {
    await request(h.app).post('/api/translate').set(AUTH).send({ text: 'Hello', sourceLang: 'en', targetLang: 'es' });
    await h.storage.close();
    expect(existsSync(join(h.dir, 'history.json'))).toBe(false);
  });

  it('settings no longer offer a history option', async () => {
    const res = await request(h.app).put('/api/settings').set(AUTH).send({ saveHistory: true });
    expect(res.body.saveHistory).toBeUndefined();
    expect((await request(h.app).get('/api/settings').set(AUTH)).body.saveHistory).toBeUndefined();
  });
});

describe('retired AI tool routes', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
  });
  afterEach(async () => {
    await h.close();
  });

  it('no longer exist, even for the admin', async () => {
    for (const path of ['detect-language', 'grammar', 'rewrite', 'summarize', 'smart-reply', 'ai-assistant']) {
      const res = await request(h.app).post(`/api/${path}`).set(AUTH).send({ text: 'hello' });
      expect(res.status, path).toBe(404);
    }
  });
});
