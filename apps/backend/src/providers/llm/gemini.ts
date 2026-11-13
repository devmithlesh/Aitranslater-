import { getProviderDescriptor } from '@verba/shared';
import { isRecord } from '../../utils/json';
import { requestJson } from '../http';
import type { HttpOptions } from '../http';
import { ProviderError, tokenCount } from '../types';
import type { GenerateInput, LlmProvider, ResolvedProviderConfig } from '../types';

const PROVIDER = 'gemini';

/** Total tokens from usageMetadata; falls back to prompt + candidates. Undefined when not reported. */
function extractTokens(data: unknown): number | undefined {
  const meta = isRecord(data) ? data.usageMetadata : undefined;
  if (!isRecord(meta)) return undefined;
  const total = tokenCount(meta.totalTokenCount);
  if (total !== undefined) return total;
  const prompt = tokenCount(meta.promptTokenCount);
  const candidates = tokenCount(meta.candidatesTokenCount);
  if (prompt === undefined && candidates === undefined) return undefined;
  return (prompt ?? 0) + (candidates ?? 0);
}

function extractText(data: unknown): string {
  if (!isRecord(data)) throw new ProviderError(PROVIDER, 'Gemini returned an unexpected response.');

  const feedback = data.promptFeedback;
  if (isRecord(feedback) && typeof feedback.blockReason === 'string') {
    throw new ProviderError(PROVIDER, `Gemini blocked the request (${feedback.blockReason}).`);
  }

  const candidates: unknown[] = Array.isArray(data.candidates) ? data.candidates : [];
  const candidate: unknown = candidates[0];
  if (!isRecord(candidate)) throw new ProviderError(PROVIDER, 'Gemini returned no candidates.');

  const finish = candidate.finishReason;
  if (typeof finish === 'string' && finish !== 'STOP' && finish !== 'MAX_TOKENS') {
    throw new ProviderError(PROVIDER, `Gemini stopped the response (${finish}).`);
  }

  const parts: unknown[] = isRecord(candidate.content) && Array.isArray(candidate.content.parts) ? candidate.content.parts : [];
  const text = parts.map((part) => (isRecord(part) && typeof part.text === 'string' ? part.text : '')).join('').trim();
  if (!text) throw new ProviderError(PROVIDER, 'Gemini returned an empty response.');
  return text;
}

export function createGeminiProvider(http: HttpOptions): LlmProvider {
  return {
    id: PROVIDER,
    async generate(input: GenerateInput, cfg: ResolvedProviderConfig) {
      if (!cfg.apiKey) throw new ProviderError(PROVIDER, 'Gemini needs an API key.', 'config');
      const base = (cfg.baseUrl ?? getProviderDescriptor(PROVIDER).defaultBaseUrl ?? '').replace(/\/+$/, '');
      const model = cfg.model ?? getProviderDescriptor(PROVIDER).defaultModel ?? 'gemini-3.5-flash-lite';
      const data = await requestJson({
        provider: PROVIDER,
        url: `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        headers: { 'x-goog-api-key': cfg.apiKey },
        body: {
          systemInstruction: { parts: [{ text: input.system }] },
          contents: [{ role: 'user', parts: [{ text: input.prompt }] }],
          generationConfig: {
            temperature: input.temperature ?? 0.3,
            maxOutputTokens: input.maxTokens ?? 2048,
            responseMimeType: input.json ? 'application/json' : undefined,
          },
        },
        signal: input.signal,
        timeoutMs: http.timeoutMs,
        redact: [cfg.apiKey],
      });
      return { text: extractText(data), model, tokens: extractTokens(data) };
    },
  };
}
