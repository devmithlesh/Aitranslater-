import type { RewriteStyle, TranslationTone } from '@verba/shared';
import { isRecord } from '../../utils/json';
import { normalizeLanguage } from '../../utils/text';
import { requestJson } from '../http';
import type { HttpOptions } from '../http';
import { ProviderError, UnsupportedLanguageError } from '../types';
import type { ResolvedProviderConfig, TranslateInput, TranslationProvider } from '../types';

const PROVIDER = 'deepl';

const TARGETS = new Set([
  'AR', 'BG', 'CS', 'DA', 'DE', 'EL', 'EN-US', 'ES', 'ET', 'FI', 'FR', 'HU', 'ID', 'IT', 'JA', 'KO', 'LT', 'LV',
  'NB', 'NL', 'PL', 'PT-BR', 'RO', 'RU', 'SK', 'SL', 'SV', 'TR', 'UK', 'ZH-HANS', 'ZH-HANT',
]);

const SOURCES = new Set([
  'AR', 'BG', 'CS', 'DA', 'DE', 'EL', 'EN', 'ES', 'ET', 'FI', 'FR', 'HU', 'ID', 'IT', 'JA', 'KO', 'LT', 'LV',
  'NB', 'NL', 'PL', 'PT', 'RO', 'RU', 'SK', 'SL', 'SV', 'TR', 'UK', 'ZH',
]);

/** Targets that accept the `formality` option. */
const FORMALITY_TARGETS = new Set(['DE', 'ES', 'FR', 'IT', 'JA', 'NL', 'PL', 'PT-BR', 'RU']);

const FORMAL_STYLES: ReadonlySet<RewriteStyle> = new Set(['formal', 'professional', 'business', 'polite']);
const CASUAL_STYLES: ReadonlySet<RewriteStyle> = new Set(['casual', 'friendly']);
const FORMAL_TONES: ReadonlySet<TranslationTone> = new Set(['formal', 'professional']);

function toDeeplTarget(code: string): string {
  if (code === 'en') return 'EN-US';
  if (code === 'pt') return 'PT-BR';
  if (code === 'zh-Hans') return 'ZH-HANS';
  if (code === 'zh-Hant') return 'ZH-HANT';
  return code.toUpperCase();
}

function toDeeplSource(code: string): string | undefined {
  const base = code.startsWith('zh') ? 'ZH' : code.split('-')[0].toUpperCase();
  return SOURCES.has(base) ? base : undefined;
}

function formalityFor(input: TranslateInput): 'prefer_more' | 'prefer_less' | undefined {
  if (input.style && FORMAL_STYLES.has(input.style)) return 'prefer_more';
  if (input.style && CASUAL_STYLES.has(input.style)) return 'prefer_less';
  if (input.tone && FORMAL_TONES.has(input.tone)) return 'prefer_more';
  if (input.tone === 'casual') return 'prefer_less';
  return undefined;
}

function requireKey(cfg: ResolvedProviderConfig): string {
  if (!cfg.apiKey) throw new ProviderError(PROVIDER, 'DeepL needs an API key.', 'config');
  return cfg.apiKey;
}

/** Free-tier keys end in ":fx" and must use the free host. */
function hostFor(key: string): string {
  return key.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
}

export function createDeeplProvider(http: HttpOptions): TranslationProvider {
  return {
    id: PROVIDER,
    async translate(input, cfg) {
      const key = requireKey(cfg);
      const target = toDeeplTarget(input.target);
      if (!TARGETS.has(target)) {
        throw new UnsupportedLanguageError(PROVIDER, `DeepL does not support ${input.target} as a target language.`);
      }
      const body: Record<string, unknown> = { text: [input.text], target_lang: target };
      if (input.source !== 'auto') {
        const source = toDeeplSource(input.source);
        if (source) body.source_lang = source;
      }
      const formality = FORMALITY_TARGETS.has(target) ? formalityFor(input) : undefined;
      if (formality) body.formality = formality;

      const data = await requestJson({
        provider: PROVIDER,
        url: `${hostFor(key)}/v2/translate`,
        headers: { Authorization: `DeepL-Auth-Key ${key}` },
        body,
        signal: input.signal,
        timeoutMs: http.timeoutMs,
        redact: [key],
      });
      const translations = isRecord(data) ? data.translations : undefined;
      const first = Array.isArray(translations) ? translations[0] : undefined;
      if (!isRecord(first) || typeof first.text !== 'string') {
        throw new ProviderError(PROVIDER, 'DeepL returned an unexpected response.');
      }
      const detected =
        typeof first.detected_source_language === 'string' ? normalizeLanguage(first.detected_source_language.toLowerCase()) : undefined;
      return { text: first.text, detectedSourceLang: detected };
    },
  };
}
