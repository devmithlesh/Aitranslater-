import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH, createHarness, type Harness, jsonResponse, mockFetch, unexpectedUrl } from './helpers';

const GEMINI_KEY = 'gem-test-key-abcdef';
const AZURE_KEY = 'azure-test-key-1234';

function geminiReply(text: string): Response {
  return jsonResponse({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] });
}

describe('translation routing', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await h.close();
  });

  it('translates with MyMemory by default and sends the correct langpair', async () => {
    const fetchMock = mockFetch((url) => {
      if (url.startsWith('https://api.mymemory.translated.net/get')) {
        return jsonResponse({ responseStatus: 200, responseData: { translatedText: 'Hola, ¿cómo estás?' } });
      }
      return unexpectedUrl(url);
    });

    const res = await request(h.app)
      .post('/api/translate')
      .set(AUTH)
      .send({ text: 'Hello, how are you?', sourceLang: 'en', targetLang: 'es' });

    expect(res.status).toBe(200);
    expect(res.body.translatedText).toBe('Hola, ¿cómo estás?');
    expect(res.body.provider).toBe('mymemory');
    expect(typeof res.body.latencyMs).toBe('number');
    const calledUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(calledUrl.searchParams.get('langpair')).toBe('en|es');
    expect(calledUrl.searchParams.get('q')).toBe('Hello, how are you?');
    expect(res.body.historyId).toEqual(expect.any(String));
  });

  it('uses Autodetect for an auto source language', async () => {
    const fetchMock = mockFetch((url) =>
      url.startsWith('https://api.mymemory.translated.net/get')
        ? jsonResponse({ responseStatus: 200, responseData: { translatedText: 'Hola' } })
        : unexpectedUrl(url),
    );
    const res = await request(h.app)
      .post('/api/translate')
      .set(AUTH)
      .send({ text: 'Hello', sourceLang: 'auto', targetLang: 'es' });
    expect(res.status).toBe(200);
    const calledUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(calledUrl.searchParams.get('langpair')).toBe('Autodetect|es');
  });

  it('falls back to the next provider when the first one fails', async () => {
    await request(h.app).put('/api/providers/azure').set(AUTH).send({ apiKey: AZURE_KEY, enabled: true });
    mockFetch((url) => {
      if (url.startsWith('https://api.mymemory.translated.net/')) {
        return jsonResponse({ responseStatus: 500, responseDetails: 'server error' });
      }
      if (url.startsWith('https://api.cognitive.microsofttranslator.com/translate')) {
        return jsonResponse([{ translations: [{ text: 'Hola', to: 'es' }] }]);
      }
      return unexpectedUrl(url);
    });

    const res = await request(h.app)
      .post('/api/translate')
      .set(AUTH)
      .send({ text: 'Hello', sourceLang: 'en', targetLang: 'es' });

    expect(res.status).toBe(200);
    expect(res.body.provider).toBe('azure');
    expect(res.body.translatedText).toBe('Hola');
  });

  it('returns 502 with per-provider details when every provider fails', async () => {
    await request(h.app).put('/api/providers/azure').set(AUTH).send({ apiKey: AZURE_KEY });
    mockFetch((url) => {
      if (url.startsWith('https://api.mymemory.translated.net/')) {
        return jsonResponse({ responseStatus: 500, responseDetails: 'boom' });
      }
      if (url.startsWith('https://api.cognitive.microsofttranslator.com/')) {
        return jsonResponse({ error: { message: 'Access denied' } }, 401);
      }
      return unexpectedUrl(url);
    });

    const res = await request(h.app)
      .post('/api/translate')
      .set(AUTH)
      .send({ text: 'Hello', sourceLang: 'en', targetLang: 'es' });

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('PROVIDER_ERROR');
    expect(res.body.error.details).toHaveLength(2);
    expect(res.body.error.details.map((d: { provider: string }) => d.provider)).toEqual(['mymemory', 'azure']);
    expect(JSON.stringify(res.body)).not.toContain(AZURE_KEY);
  });

  it('returns 503 for a styled translation when no AI model is configured', async () => {
    const res = await request(h.app)
      .post('/api/translate')
      .set(AUTH)
      .send({ text: 'Hello', sourceLang: 'en', targetLang: 'es', style: 'funny' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('NO_PROVIDER_CONFIGURED');
    expect(res.body.error.message).toContain('Styled and Hinglish translations need an AI model provider');
  });

  it('routes a styled translation through the LLM with the style applied', async () => {
    await request(h.app).put('/api/providers/gemini').set(AUTH).send({ apiKey: GEMINI_KEY });
    const fetchMock = mockFetch((url) => {
      if (url.includes('generativelanguage.googleapis.com')) {
        return geminiReply('{"translation":"¡Hola, qué tal!","detectedLanguage":"en","romanized":false}');
      }
      return unexpectedUrl(url);
    });

    const res = await request(h.app)
      .post('/api/translate')
      .set(AUTH)
      .send({ text: 'Hello, how are you?', sourceLang: 'en', targetLang: 'es', style: 'funny' });

    expect(res.status).toBe(200);
    expect(res.body.provider).toBe('llm');
    expect(res.body.style).toBe('funny');
    expect(res.body.translatedText).toBe('¡Hola, qué tal!');
    expect(JSON.stringify(res.body)).not.toContain(GEMINI_KEY);

    const sent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      systemInstruction: { parts: { text: string }[] };
    };
    expect(sent.systemInstruction.parts[0].text).toContain('playful and witty');
    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe(GEMINI_KEY);
  });

  it('rejects a styled request that asks for a non-LLM provider', async () => {
    const res = await request(h.app)
      .post('/api/translate')
      .set(AUTH)
      .send({ text: 'Hello', sourceLang: 'en', targetLang: 'es', style: 'funny', provider: 'mymemory' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 503 when a forced provider is not ready', async () => {
    const res = await request(h.app)
      .post('/api/translate')
      .set(AUTH)
      .send({ text: 'Hello', sourceLang: 'en', targetLang: 'es', provider: 'deepl' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('NO_PROVIDER_CONFIGURED');
  });
});
