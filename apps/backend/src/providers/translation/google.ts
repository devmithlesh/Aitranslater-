import { isRecord } from '../../utils/json';
import { normalizeLanguage } from '../../utils/text';
import { requestJson } from '../http';
import type { HttpOptions } from '../http';
import { ProviderError } from '../types';
import type { ResolvedProviderConfig, TranslationProvider } from '../types';

const PROVIDER = 'google';
const BASE_URL = 'https://translation.googleapis.com';

/** Google's Basic v2 uses its own codes for a few languages. */
function toGoogle(code: string): string {
  if (code === 'zh-Hans') return 'zh-CN';
  if (code === 'zh-Hant') return 'zh-TW';
  if (code === 'nb') return 'no';
  if (code === 'fil') return 'tl';
  return code;
}

function requireKey(cfg: ResolvedProviderConfig): string {
  if (!cfg.apiKey) throw new ProviderError(PROVIDER, 'Google Cloud Translation needs an API key.', 'config');
  return cfg.apiKey;
}

function endpoint(path: string, key: string): string {
  const url = new URL(path, BASE_URL);
  url.searchParams.set('key', key);
  return url.toString();
}

export function createGoogleProvider(http: HttpOptions): TranslationProvider {
  return {
    id: PROVIDER,
    async translate(input, cfg) {
      const key = requireKey(cfg);
      const body: Record<string, string> = {
        q: input.text,
        target: toGoogle(input.target),
        format: 'text',
      };
      if (input.source !== 'auto') body.source = toGoogle(input.source);
      const data = await requestJson({
        provider: PROVIDER,
        url: endpoint('/language/translate/v2', key),
        body,
        signal: input.signal,
        timeoutMs: http.timeoutMs,
        redact: [key],
      });
      const translations = isRecord(data) && isRecord(data.data) ? data.data.translations : undefined;
      const first = Array.isArray(translations) ? translations[0] : undefined;
      if (!isRecord(first) || typeof first.translatedText !== 'string') {
        throw new ProviderError(PROVIDER, 'Google Cloud Translation returned an unexpected response.');
      }
      const detected = typeof first.detectedSourceLanguage === 'string' ? first.detectedSourceLanguage : undefined;
      return {
        text: first.translatedText,
        detectedSourceLang: detected ? normalizeLanguage(detected) : undefined,
      };
    },
  };
}
