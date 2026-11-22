import { isRecord } from '../../utils/json';
import { normalizeLanguage } from '../../utils/text';
import { requestJson } from '../http';
import type { HttpOptions } from '../http';
import { ProviderError } from '../types';
import type { ResolvedProviderConfig, TranslationProvider } from '../types';

const PROVIDER = 'azure';
const BASE_URL = 'https://api.cognitive.microsofttranslator.com';

function requireKey(cfg: ResolvedProviderConfig): string {
  if (!cfg.apiKey) throw new ProviderError(PROVIDER, 'Azure Translator needs an API key.', 'config');
  return cfg.apiKey;
}

function authHeaders(cfg: ResolvedProviderConfig): Record<string, string> {
  const headers: Record<string, string> = { 'Ocp-Apim-Subscription-Key': requireKey(cfg) };
  if (cfg.region) headers['Ocp-Apim-Subscription-Region'] = cfg.region;
  return headers;
}

function endpoint(path: string, params: Record<string, string>): string {
  const url = new URL(path, BASE_URL);
  url.searchParams.set('api-version', '3.0');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

export function createAzureProvider(http: HttpOptions): TranslationProvider {
  return {
    id: PROVIDER,
    async translate(input, cfg) {
      const params: Record<string, string> = { to: input.target };
      if (input.source !== 'auto') params.from = input.source;
      const data = await requestJson({
        provider: PROVIDER,
        url: endpoint('/translate', params),
        headers: authHeaders(cfg),
        body: [{ Text: input.text }],
        signal: input.signal,
        timeoutMs: http.timeoutMs,
        redact: [requireKey(cfg)],
      });
      const first: unknown = Array.isArray(data) ? data[0] : undefined;
      const translation = isRecord(first) && Array.isArray(first.translations) ? first.translations[0] : undefined;
      if (!isRecord(translation) || typeof translation.text !== 'string') {
        throw new ProviderError(PROVIDER, 'Azure Translator returned an unexpected response.');
      }
      const detected = isRecord(first) ? first.detectedLanguage : undefined;
      const detectedCode = isRecord(detected) && typeof detected.language === 'string' ? detected.language : undefined;
      return {
        text: translation.text,
        detectedSourceLang: detectedCode ? normalizeLanguage(detectedCode) : undefined,
      };
    },
  };
}
