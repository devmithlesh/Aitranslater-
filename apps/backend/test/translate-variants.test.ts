import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UsageService } from '../src/services/usage.service';
import { AUTH, createHarness, type Harness, jsonResponse, mockFetch, unexpectedUrl } from './helpers';

const GEMINI_KEY = 'gem-test-key-abcdef';

function geminiText(text: string): Response {
  return jsonResponse({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] });
}

const DEFAULT_STYLES = ['natural', 'professional', 'casual', 'polite', 'funny', 'formal'];

describe('POST /api/translate-variants', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
    await request(h.app).put('/api/providers/gemini').set(AUTH).send({ apiKey: GEMINI_KEY });
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await h.close();
  });

  it('returns variants in default order for a Hinglish input, omitting styles the model skipped', async () => {
    const variants: Record<string, string> = {
      natural: 'Hi, how are you?',
      professional: 'Hello, how are you doing?',
      casual: 'Hey, how r u?',
      funny: 'Yo, how are ya doing, my friend?',
      formal: 'Good day, how are you?',
    };
    mockFetch((url) =>
      url.includes('generativelanguage.googleapis.com')
        ? geminiText(
            '```json\n' +
              JSON.stringify({
                meaning: 'The speaker asks how the listener is doing.',
                detectedLanguage: 'hi',
                romanized: true,
                variants,
              }) +
              '\n```',
          )
        : unexpectedUrl(url),
    );

    const res = await request(h.app)
      .post('/api/translate-variants')
      .set(AUTH)
      .send({ text: 'hi tum kese ho', sourceLang: 'auto', targetLang: 'en' });

    expect(res.status).toBe(200);
    expect(res.body.provider).toBe('gemini');
    expect(res.body.meaning).toBe('The speaker asks how the listener is doing.');
    expect(res.body.detectedSourceLang).toBe('hi');
    expect(res.body.romanized).toBe(true);
    expect(res.body.historyId).toEqual(expect.any(String));
    expect(res.body.variants.map((v: { style: string }) => v.style)).toEqual(
      DEFAULT_STYLES.filter((style) => style !== 'polite'),
    );
    expect(res.body.variants[0]).toEqual({ style: 'natural', text: 'Hi, how are you?' });
    expect(JSON.stringify(res.body)).not.toContain(GEMINI_KEY);
  });

  it('sends every requested style to the model in one call', async () => {
    const fetchMock = mockFetch((url) =>
      url.includes('generativelanguage.googleapis.com')
        ? geminiText(
            JSON.stringify({
              meaning: 'Greeting.',
              detectedLanguage: 'en',
              romanized: false,
              variants: { natural: 'Hello.', polite: 'Good day.' },
            }),
          )
        : unexpectedUrl(url),
    );

    const res = await request(h.app)
      .post('/api/translate-variants')
      .set(AUTH)
      .send({ text: 'Hello', sourceLang: 'en', targetLang: 'es', styles: ['polite', 'natural'] });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.body.detectedSourceLang).toBeUndefined();
    expect(res.body.variants).toEqual([
      { style: 'polite', text: 'Good day.' },
      { style: 'natural', text: 'Hello.' },
    ]);
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      systemInstruction: { parts: { text: string }[] };
    };
    const system = sent.systemInstruction.parts[0].text;
    expect(system).toContain('- "polite": courteous and considerate');
    expect(system).toContain('- "natural": natural and fluent');
    expect(system).toContain('ROMANIZED');
  });

  it('dedupes repeated styles while keeping the requested order', async () => {
    mockFetch((url) =>
      url.includes('generativelanguage.googleapis.com')
        ? geminiText(
            JSON.stringify({
              meaning: 'Thanks.',
              detectedLanguage: 'en',
              romanized: false,
              variants: { formal: 'Thank you.', casual: 'Thanks!' },
            }),
          )
        : unexpectedUrl(url),
    );

    const res = await request(h.app)
      .post('/api/translate-variants')
      .set(AUTH)
      .send({ text: 'Thanks', sourceLang: 'en', targetLang: 'fr', styles: ['formal', 'formal', 'casual'] });

    expect(res.status).toBe(200);
    expect(res.body.variants.map((v: { style: string }) => v.style)).toEqual(['formal', 'casual']);
  });

  it('rejects more than 8 styles with 400', async () => {
    const res = await request(h.app)
      .post('/api/translate-variants')
      .set(AUTH)
      .send({
        text: 'Hello',
        sourceLang: 'en',
        targetLang: 'es',
        styles: ['natural', 'professional', 'casual', 'polite', 'funny', 'formal', 'friendly', 'simple', 'academic'],
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects empty text with 400', async () => {
    const res = await request(h.app)
      .post('/api/translate-variants')
      .set(AUTH)
      .send({ text: '   ', sourceLang: 'en', targetLang: 'es' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an unknown style with 400', async () => {
    const res = await request(h.app)
      .post('/api/translate-variants')
      .set(AUTH)
      .send({ text: 'Hello', sourceLang: 'en', targetLang: 'es', styles: ['sarcastic'] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 502 when the model output is not usable JSON', async () => {
    mockFetch((url) =>
      url.includes('generativelanguage.googleapis.com') ? geminiText('no json here') : unexpectedUrl(url),
    );
    const res = await request(h.app)
      .post('/api/translate-variants')
      .set(AUTH)
      .send({ text: 'Hello there.', sourceLang: 'en', targetLang: 'es' });
    expect(res.status).toBe(502);
    expect(res.body.error.details[0].provider).toBe('gemini');
  });

  it('returns 502 when the model returns no usable variants', async () => {
    mockFetch((url) =>
      url.includes('generativelanguage.googleapis.com')
        ? geminiText(JSON.stringify({ meaning: 'x', variants: { natural: '   ', funny: 42 } }))
        : unexpectedUrl(url),
    );
    const res = await request(h.app)
      .post('/api/translate-variants')
      .set(AUTH)
      .send({ text: 'Hello there.', sourceLang: 'en', targetLang: 'es' });
    expect(res.status).toBe(502);
  });

  it('returns 503 when no AI model is configured', async () => {
    const bare = await createHarness();
    try {
      const res = await request(bare.app)
        .post('/api/translate-variants')
        .set(AUTH)
        .send({ text: 'Hello', sourceLang: 'en', targetLang: 'es' });
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('NO_PROVIDER_CONFIGURED');
    } finally {
      await bare.close();
    }
  });
});

describe('POST /api/translate-variants hardening', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
    await request(h.app).put('/api/providers/gemini').set(AUTH).send({ apiKey: GEMINI_KEY });
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await h.close();
  });

  const variantsReply = (detectedLanguage: string) =>
    geminiText(
      JSON.stringify({
        meaning: 'Greeting.',
        detectedLanguage,
        romanized: true,
        variants: { natural: 'Hello.' },
      }),
    );

  it('drops a detected language the shared list does not know', async () => {
    mockFetch((url) =>
      url.includes('generativelanguage.googleapis.com') ? variantsReply('Hinglish') : unexpectedUrl(url),
    );
    const res = await request(h.app)
      .post('/api/translate-variants')
      .set(AUTH)
      .send({ text: 'kya haal hai', sourceLang: 'auto', targetLang: 'en', styles: ['natural'] });
    expect(res.status).toBe(200);
    expect(res.body.detectedSourceLang).toBeUndefined();
  });

  it('sizes the output budget from the text length and style count, within bounds', async () => {
    const fetchMock = mockFetch((url) =>
      url.includes('generativelanguage.googleapis.com') ? variantsReply('en') : unexpectedUrl(url),
    );
    await request(h.app).post('/api/translate-variants').set(AUTH).send({ text: 'Hello', sourceLang: 'en', targetLang: 'es' });
    await request(h.app)
      .post('/api/translate-variants')
      .set(AUTH)
      .send({ text: 'x'.repeat(2000), sourceLang: 'en', targetLang: 'es' });
    const budgets = fetchMock.mock.calls.map(
      ([, init]) =>
        (JSON.parse(String(init?.body)) as { generationConfig: { maxOutputTokens: number } }).generationConfig
          .maxOutputTokens,
    );
    expect(budgets).toEqual([4096, 16384]);
  });

  it('still returns 200 with no historyId when history recording fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // Stub the storage instance this app uses (a prototype spy is fragile across parallel workers).
    vi.spyOn(h.storage, 'insertHistory').mockRejectedValue(new Error('disk full'));
    mockFetch((url) => (url.includes('generativelanguage.googleapis.com') ? variantsReply('en') : unexpectedUrl(url)));
    const res = await request(h.app)
      .post('/api/translate-variants')
      .set(AUTH)
      .send({ text: 'Hello', sourceLang: 'en', targetLang: 'es', styles: ['natural'] });
    expect(res.status).toBe(200);
    expect(res.body.historyId).toBeUndefined();
    expect(res.body.variants).toEqual([{ style: 'natural', text: 'Hello.' }]);
    expect(console.warn).toHaveBeenCalledWith('[verba] could not record history:', 'disk full');
  });

  it('still returns 200 when provider usage recording fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(UsageService.prototype, 'recordCall').mockRejectedValue(new Error('usage write failed'));
    mockFetch((url) => (url.includes('generativelanguage.googleapis.com') ? variantsReply('en') : unexpectedUrl(url)));
    const res = await request(h.app)
      .post('/api/translate-variants')
      .set(AUTH)
      .send({ text: 'Hello', sourceLang: 'en', targetLang: 'es', styles: ['natural'] });
    expect(res.status).toBe(200);
    expect(res.body.variants).toEqual([{ style: 'natural', text: 'Hello.' }]);
  });
});
