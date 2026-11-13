import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src/middleware/auth';
import { AUTH, createHarness, type Harness, jsonResponse, mockFetch, unexpectedUrl } from './helpers';

const GEMINI_KEY = 'gem-test-key-abcdef';
const ATTACKER = 'http://attacker.example';

describe('provider base URLs', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
  });
  afterEach(async () => {
    await h.close();
  });

  it('rejects a base URL for a provider that does not support one', async () => {
    const res = await request(h.app).put('/api/providers/gemini').set(AUTH).send({ baseUrl: ATTACKER });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('still accepts a base URL for a provider that supports one', async () => {
    const res = await request(h.app)
      .put('/api/providers/ollama')
      .set(AUTH)
      .send({ baseUrl: 'http://127.0.0.1:11434/v1' });
    expect(res.status).toBe(200);
    expect(res.body.baseUrl).toBe('http://127.0.0.1:11434/v1');
  });

  it('ignores a base URL stored before the rule existed, so the key goes to the real host', async () => {
    await request(h.app).put('/api/providers/gemini').set(AUTH).send({ apiKey: GEMINI_KEY });
    const configs = await h.storage.getProviderConfigs(LOCAL_USER_ID);
    await h.storage.saveProviderConfig(LOCAL_USER_ID, 'gemini', { ...configs.gemini!, baseUrl: ATTACKER });

    const view = await request(h.app).get('/api/providers').set(AUTH);
    const gemini = view.body.items.find((item: { id: string }) => item.id === 'gemini');
    expect(gemini.baseUrl).toBeNull();

    const fetchMock = mockFetch((url) =>
      url.includes('generativelanguage.googleapis.com')
        ? jsonResponse({ candidates: [{ content: { parts: [{ text: 'OK' }] }, finishReason: 'STOP' }] })
        : unexpectedUrl(url),
    );
    const res = await request(h.app).post('/api/providers/gemini/test').set(AUTH);
    expect(res.body.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/^https:\/\/generativelanguage\.googleapis\.com\//);
  });
});
