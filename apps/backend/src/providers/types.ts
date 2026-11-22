import type { LlmProviderId, ProviderId, RewriteStyle, TranslationProviderId, TranslationTone } from '@verba/shared';

/** Runtime configuration for one provider call: stored settings with the key decrypted and env fallbacks applied. */
export interface ResolvedProviderConfig {
  id: ProviderId;
  apiKey: string | null;
  baseUrl: string | null;
  model: string | null;
  region: string | null;
}

export interface TranslateInput {
  text: string;
  /** Language code or "auto". */
  source: string;
  target: string;
  tone?: TranslationTone;
  style?: RewriteStyle;
  signal: AbortSignal;
}

export interface TranslateOutput {
  text: string;
  detectedSourceLang?: string;
  romanized?: boolean;
  model?: string;
}

export interface TranslationProvider {
  readonly id: TranslationProviderId;
  translate(input: TranslateInput, cfg: ResolvedProviderConfig): Promise<TranslateOutput>;
}

/** A picture the model should look at (base64, no data: prefix). */
export interface GenerateImage {
  mimeType: string;
  data: string;
}

export interface GenerateInput {
  system: string;
  prompt: string;
  images?: GenerateImage[];
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  signal: AbortSignal;
}

export interface GenerateOutput {
  text: string;
  model: string;
  /** Input + output tokens reported by the provider. Only set when the provider reports a valid count. */
  tokens?: number;
}

export interface LlmProvider {
  readonly id: LlmProviderId;
  generate(input: GenerateInput, cfg: ResolvedProviderConfig): Promise<GenerateOutput>;
}

/** Returns the value if it is a non-negative integer token count, otherwise undefined. */
export function tokenCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

export interface LlmRunResult<T> {
  value: T;
  model?: string;
  tokens?: number;
}

/**
 * Runs a generation through the LLM fallback chain. `parse` validates the raw
 * text; a parse failure moves the chain on to the next LLM.
 */
export type LlmRunner = <T>(
  input: GenerateInput,
  parse: (raw: string) => T,
  chars?: number,
) => Promise<LlmRunResult<T>>;

export type ProviderErrorKind = 'failed' | 'timeout' | 'unsupported' | 'parse' | 'config';

/** A failure from one provider. Messages are safe to show to users (never contain keys). */
export class ProviderError extends Error {
  readonly provider: ProviderId;
  readonly kind: ProviderErrorKind;

  constructor(provider: ProviderId, message: string, kind: ProviderErrorKind = 'failed') {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.kind = kind;
  }
}

export class ProviderTimeoutError extends ProviderError {
  constructor(provider: ProviderId, message: string) {
    super(provider, message, 'timeout');
    this.name = 'ProviderTimeoutError';
  }
}

/** Thrown when a provider cannot handle a language pair; the chain skips it without counting a failure. */
export class UnsupportedLanguageError extends ProviderError {
  constructor(provider: ProviderId, message: string) {
    super(provider, message, 'unsupported');
    this.name = 'UnsupportedLanguageError';
  }
}
