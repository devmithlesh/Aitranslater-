import request from 'supertest';
import type { Express } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOpenAiCompatibleProvider } from '../src/providers/llm/openai-compatible';
import { summarizeUsage } from '../src/services/usage.service';
import { dayKey, monthKey } from '../src/utils/dates';
import { AUTH, createHarness, type Harness, jsonResponse, mockFetch, unexpectedUrl } from './helpers';

const GEMINI_KEY = 'gem-test-key-abcdef';
const VARIANTS_PAYLOAD = {
  meaning: 'A greeting.',
  detectedLanguage: 'en',
  romanized: false,
  variants: { natural: 'Hello there.' },
};

function geminiReply(usageMetadata?: unknown): Response {
  return jsonResponse({
    candidates: [{ content: { parts: [{ text: JSON.stringify(VARIANTS_PAYLOAD) }] }, finishReason: 'STOP' }],
    ...(usageMetadata === undefined ? {} : { usageMetadata }),
  });
}

async function geminiUsage(app: Express): Promise<{ tokensToday: number; tokensThisMonth: number; requestsThisMonth: number }> {
  const res = await request(app).get('/api/providers').set(AUTH);
  expect(res.status).toBe(200);
  const gemini = res.body.items.find((item: { id: string }) => item.id === 'gemini');
  return gemini.usage;
}

async function translateOnce(app: Express): Promise<void> {
  const res = await request(app)
    .post('/api/translate-variants')
    .set(AUTH)
    .send({ text: 'hello there', sourceLang: 'auto', targetLang: 'en' });
  expect(res.status).toBe(200);
}

describe('AI token usage for Gemini (POST /api/translate-variants)', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
    await request(h.app).put('/api/providers/gemini').set(AUTH).send({ apiKey: GEMINI_KEY });
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await h.close();
  });

  it('records usageMetadata.totalTokenCount for today and this month, and adds up across calls', async () => {
    mockFetch((url) =>
      url.includes('generativelanguage.googleapis.com')
        ? geminiReply({ totalTokenCount: 123 })
        : unexpectedUrl(url),
    );

    await translateOnce(h.app);
    let usage = await geminiUsage(h.app);
    expect(usage.tokensToday).toBe(123);
    expect(usage.tokensThisMonth).toBe(123);

    await translateOnce(h.app);
    usage = await geminiUsage(h.app);
    expect(usage.tokensToday).toBe(246);
    expect(usage.tokensThisMonth).toBe(246);
    expect(usage.requestsThisMonth).toBe(2);
  });

  it('falls back to promptTokenCount + candidatesTokenCount when totalTokenCount is missing', async () => {
    mockFetch((url) =>
      url.includes('generativelanguage.googleapis.com')
        ? geminiReply({ promptTokenCount: 40, candidatesTokenCount: 10 })
        : unexpectedUrl(url),
    );

    await translateOnce(h.app);
    const usage = await geminiUsage(h.app);
    expect(usage.tokensToday).toBe(50);
    expect(usage.tokensThisMonth).toBe(50);
  });

  it('succeeds and adds no tokens when the reply has no usageMetadata', async () => {
    mockFetch((url) =>
      url.includes('generativelanguage.googleapis.com')
        ? geminiReply({ totalTokenCount: 123 })
        : unexpectedUrl(url),
    );
    await translateOnce(h.app);

    mockFetch((url) =>
      url.includes('generativelanguage.googleapis.com') ? geminiReply() : unexpectedUrl(url),
    );
    await translateOnce(h.app);

    const usage = await geminiUsage(h.app);
    expect(usage.tokensToday).toBe(123);
    expect(usage.tokensThisMonth).toBe(123);
    expect(usage.requestsThisMonth).toBe(2);
  });

  it('ignores invalid token counts instead of failing the call', async () => {
    mockFetch((url) =>
      url.includes('generativelanguage.googleapis.com')
        ? geminiReply({ totalTokenCount: 'lots', promptTokenCount: -4, candidatesTokenCount: 1.5 })
        : unexpectedUrl(url),
    );

    await translateOnce(h.app);
    const usage = await geminiUsage(h.app);
    expect(usage.tokensToday).toBe(0);
    expect(usage.tokensThisMonth).toBe(0);
  });
});

describe('OpenAI-compatible token extraction', () => {
  const signal = new AbortController().signal;
  const cfg = {
    id: 'groq' as const,
    apiKey: 'groq-test-key',
    baseUrl: 'https://api.groq.test/openai/v1',
    model: 'test-model',
    region: null,
  };
  const provider = createOpenAiCompatibleProvider('groq', { timeoutMs: 5000 });

  function reply(extra: Record<string, unknown>): void {
    mockFetch((url) =>
      url.includes('api.groq.test')
        ? jsonResponse({ model: 'test-model', choices: [{ message: { content: 'Hi' } }], ...extra })
        : unexpectedUrl(url),
    );
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefers usage.total_tokens', async () => {
    reply({ usage: { total_tokens: 30, prompt_tokens: 10, completion_tokens: 5 } });
    const out = await provider.generate({ system: 's', prompt: 'p', signal }, cfg);
    expect(out.tokens).toBe(30);
  });

  it('falls back to prompt_tokens + completion_tokens', async () => {
    reply({ usage: { prompt_tokens: 10, completion_tokens: 5 } });
    const out = await provider.generate({ system: 's', prompt: 'p', signal }, cfg);
    expect(out.tokens).toBe(15);
    expect(out.text).toBe('Hi');
  });

  it('reports no tokens when usage is missing or invalid', async () => {
    reply({});
    expect((await provider.generate({ system: 's', prompt: 'p', signal }, cfg)).tokens).toBeUndefined();

    reply({ usage: { total_tokens: -1, prompt_tokens: 2.5 } });
    expect((await provider.generate({ system: 's', prompt: 'p', signal }, cfg)).tokens).toBeUndefined();
  });
});

describe('usage summaries', () => {
  const now = new Date(2026, 5, 15, 12, 0, 0);

  it('summarizes a bucket written before token tracking as 0 tokens', () => {
    const summary = summarizeUsage(
      {
        daily: { [dayKey(now)]: { requests: 2, errors: 0, chars: 20, latencyMs: 300 } },
        monthly: { [monthKey(now)]: { requests: 2, errors: 0, chars: 20, latencyMs: 300 } },
        lastUsedAt: null,
      },
      now,
    );
    expect(summary.tokensToday).toBe(0);
    expect(summary.tokensThisMonth).toBe(0);
    expect(summary.requestsThisMonth).toBe(2);
  });

  it('reads tokens from today and this month buckets', () => {
    const summary = summarizeUsage(
      {
        daily: { [dayKey(now)]: { requests: 1, errors: 0, chars: 5, latencyMs: 10, tokens: 42 } },
        monthly: { [monthKey(now)]: { requests: 3, errors: 0, chars: 15, latencyMs: 30, tokens: 99 } },
        lastUsedAt: null,
      },
      now,
    );
    expect(summary.tokensToday).toBe(42);
    expect(summary.tokensThisMonth).toBe(99);
  });

  it('returns 0 tokens for a provider with no usage record', () => {
    const summary = summarizeUsage(undefined, now);
    expect(summary.tokensToday).toBe(0);
    expect(summary.tokensThisMonth).toBe(0);
  });
});
