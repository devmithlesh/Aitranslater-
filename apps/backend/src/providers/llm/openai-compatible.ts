import { getProviderDescriptor } from '@verba/shared';
import type { LlmProviderId } from '@verba/shared';
import { isRecord } from '../../utils/json';
import { HttpError, requestJson } from '../http';
import type { HttpOptions } from '../http';
import { ProviderError, tokenCount } from '../types';
import type { GenerateInput, LlmProvider, ResolvedProviderConfig } from '../types';

/** One client for every OpenAI-compatible chat endpoint (Groq, OpenRouter, OpenAI, Ollama, custom). */
export function createOpenAiCompatibleProvider(id: LlmProviderId, http: HttpOptions): LlmProvider {
  const descriptor = getProviderDescriptor(id);

  function extractContent(data: unknown): string {
    const choices: unknown[] = isRecord(data) && Array.isArray(data.choices) ? data.choices : [];
    const choice: unknown = choices[0];
    const message = isRecord(choice) ? choice.message : undefined;
    const content = isRecord(message) ? message.content : undefined;
    if (typeof content !== 'string' || !content.trim()) {
      throw new ProviderError(id, `${descriptor.name} returned an empty response.`);
    }
    return content.trim();
  }

  /** Total tokens from usage; falls back to prompt + completion. Undefined when not reported. */
  function extractTokens(data: unknown): number | undefined {
    const usage = isRecord(data) ? data.usage : undefined;
    if (!isRecord(usage)) return undefined;
    const total = tokenCount(usage.total_tokens);
    if (total !== undefined) return total;
    const prompt = tokenCount(usage.prompt_tokens);
    const completion = tokenCount(usage.completion_tokens);
    if (prompt === undefined && completion === undefined) return undefined;
    return (prompt ?? 0) + (completion ?? 0);
  }

  return {
    id,
    async generate(input: GenerateInput, cfg: ResolvedProviderConfig) {
      const baseUrl = cfg.baseUrl ?? descriptor.defaultBaseUrl;
      if (!baseUrl) throw new ProviderError(id, `${descriptor.name} needs a base URL.`, 'config');
      const model = cfg.model ?? descriptor.defaultModel ?? 'default';
      const headers: Record<string, string> = {};
      if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
      if (id === 'openrouter') {
        headers['HTTP-Referer'] = 'https://github.com/verba';
        headers['X-Title'] = 'Verba';
      }

      const base = {
        model,
        messages: [
          { role: 'system', content: input.system },
          {
            role: 'user',
            content: input.images?.length
              ? [
                  { type: 'text', text: input.prompt },
                  ...input.images.map((image) => ({
                    type: 'image_url',
                    image_url: { url: `data:${image.mimeType};base64,${image.data}` },
                  })),
                ]
              : input.prompt,
          },
        ],
        temperature: input.temperature ?? 0.3,
        max_tokens: input.maxTokens,
      };
      const send = (body: Record<string, unknown>) =>
        requestJson({
          provider: id,
          url: `${baseUrl.replace(/\/+$/, '')}/chat/completions`,
          headers,
          body,
          signal: input.signal,
          timeoutMs: http.timeoutMs,
          redact: cfg.apiKey ? [cfg.apiKey] : [],
        });

      let data: unknown;
      try {
        data = await send(input.json ? { ...base, response_format: { type: 'json_object' } } : base);
      } catch (err) {
        // Some servers reject response_format; retry once without it and rely on the prompt.
        const rejectsFormat = err instanceof HttpError && err.status === 400 && /response_format/i.test(err.body);
        if (!input.json || !rejectsFormat) throw err;
        data = await send(base);
      }

      const reportedModel = isRecord(data) && typeof data.model === 'string' ? data.model : model;
      return { text: extractContent(data), model: reportedModel, tokens: extractTokens(data) };
    },
  };
}
