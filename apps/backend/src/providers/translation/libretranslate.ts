import { isRecord } from '../../utils/json';
import { normalizeLanguage } from '../../utils/text';
import { requestJson } from '../http';
import type { HttpOptions } from '../http';
import { ProviderError } from '../types';
import type { ResolvedProviderConfig, TranslationProvider } from '../types';

const PROVIDER = 'libretranslate';

function toLibre(code: string): string {
  if (code === 'zh-Hans') return 'zh';
  if (code === 'zh-Hant') return 'zt';
  return code;
}

function fromLibre(code: string): string {
  if (code === 'zt') return 'zh-Hant';
  return normalizeLanguage(code);
}

function requireBaseUrl(cfg: ResolvedProviderConfig): string {
  if (!cfg.baseUrl) throw new ProviderError(PROVIDER, 'LibreTranslate needs a base URL.', 'config');
  return cfg.baseUrl.replace(/\/+$/, '');
}

function authFields(cfg: ResolvedProviderConfig): Record<string, string> {
  return cfg.apiKey ? { api_key: cfg.apiKey } : {};
}

function redactList(cfg: ResolvedProviderConfig): string[] {
  return cfg.apiKey ? [cfg.apiKey] : [];
}

export function createLibreTranslateProvider(http: HttpOptions): TranslationProvider {
  return {
    id: PROVIDER,
    async translate(input, cfg) {
      const base = requireBaseUrl(cfg);
      const data = await requestJson({
        provider: PROVIDER,
        url: `${base}/translate`,
        body: {
          q: input.text,
          source: input.source === 'auto' ? 'auto' : toLibre(input.source),
          target: toLibre(input.target),
          format: 'text',
          ...authFields(cfg),
        },
        signal: input.signal,
        timeoutMs: http.timeoutMs,
        redact: redactList(cfg),
      });
      if (!isRecord(data) || typeof data.translatedText !== 'string' || !data.translatedText.trim()) {
        throw new ProviderError(PROVIDER, 'LibreTranslate returned an empty translation.');
      }
      const detected = data.detectedLanguage;
      const detectedCode = isRecord(detected) && typeof detected.language === 'string' ? detected.language : undefined;
      return {
        text: data.translatedText,
        detectedSourceLang: detectedCode ? fromLibre(detectedCode) : undefined,
      };
    },
  };
}
