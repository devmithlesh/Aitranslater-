import { PROVIDERS } from '@verba/shared';
import type { ProviderDescriptor, ProviderId, ProviderTestResponse, ProviderView } from '@verba/shared';
import type { AppConfig } from '../config/env';
import { createLlmProviders, createTranslationProviders } from '../providers';
import { ProviderError, ProviderTimeoutError, UnsupportedLanguageError } from '../providers/types';
import type {
  GenerateInput,
  LlmProvider,
  LlmRunResult,
  LlmRunner,
  ResolvedProviderConfig,
  TranslationProvider,
} from '../providers/types';
import type { ProviderPatch } from '../schemas';
import type { ProviderUsageRecord, Storage, StoredProviderConfig } from '../storage/types';
import { badRequest, providerFailed, providerTimeout, notConfigured, notFound, describeError } from '../utils/errors';
import { decryptSecret, encryptSecret } from '../utils/crypto';
import { clip } from '../utils/text';
import { summarizeUsage } from './usage.service';
import type { UsageService } from './usage.service';

const DEFAULT_PRIORITY: Record<ProviderId, number> = {
  llm: 0,
  mymemory: 1,
  libretranslate: 2,
  azure: 3,
  google: 4,
  deepl: 5,
  gemini: 0,
  groq: 1,
  openrouter: 2,
  openai: 3,
  ollama: 4,
  'openai-compatible': 5,
};

const DEFAULT_ENABLED: Partial<Record<ProviderId, boolean>> = {
  ollama: false,
  'openai-compatible': false,
};

const NO_LLM_MESSAGE =
  'No AI model provider is ready. Add a Gemini, Groq or OpenRouter key, or enable Ollama.';

function defaultStoredConfig(descriptor: ProviderDescriptor): StoredProviderConfig {
  return {
    enabled: DEFAULT_ENABLED[descriptor.id] ?? true,
    priority: DEFAULT_PRIORITY[descriptor.id],
    apiKeyEnc: null,
    baseUrl: null,
    model: null,
    region: null,
    lastError: null,
  };
}

function findDescriptor(id: string): ProviderDescriptor | undefined {
  return PROVIDERS.find((descriptor) => descriptor.id === id);
}

export interface ProviderEntry {
  id: ProviderId;
  descriptor: ProviderDescriptor;
  stored: StoredProviderConfig;
  /** Effective runtime config (decrypted key, env fallbacks). Only used when `ready`. */
  cfg: ResolvedProviderConfig;
  hasApiKey: boolean;
  apiKeySource: 'settings' | 'env' | null;
  /** Base URL the user configured (settings or env), without defaults. */
  explicitBaseUrl: string | null;
  ready: boolean;
  notReadyReason: string | null;
}

export interface ChainResult<T> {
  value: T;
  provider: ProviderId;
  model?: string;
  latencyMs: number;
}

export interface ChainOptions<T> {
  /** Characters sent, for usage accounting. */
  chars: number;
  signal: AbortSignal;
  run: (entry: ProviderEntry, signal: AbortSignal) => Promise<LlmRunResult<T>>;
}

export const byPriority = (a: ProviderEntry, b: ProviderEntry): number => a.stored.priority - b.stored.priority;

/** Usage and error bookkeeping must never discard a result or skip a fallback. */
async function bookkeeping(what: string, write: () => Promise<unknown>): Promise<void> {
  try {
    await write();
  } catch (err) {
    console.warn(`[verba] could not record provider ${what}:`, err instanceof Error ? err.message : err);
  }
}

interface Failure {
  provider: ProviderId;
  message: string;
  timeout: boolean;
}

/** Provider configuration, readiness, the fallback chains and the connection test. */
export class ProviderRegistry {
  private readonly llmProviders: Map<ProviderId, LlmProvider>;
  private readonly timeoutMs: number;

  constructor(
    private readonly storage: Storage,
    private readonly usage: UsageService,
    private readonly config: AppConfig,
    private readonly key: Buffer,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.timeoutMs = config.requestTimeoutMs;
    this.llmProviders = createLlmProviders({ timeoutMs: this.timeoutMs });
  }

  async entries(userId: string): Promise<ProviderEntry[]> {
    const stored = await this.storage.getProviderConfigs(userId);
    // The "llm" translator is ready only when at least one LLM provider is ready.
    const llmReady = PROVIDERS.some((d) => d.kind === 'llm' && this.buildEntry(d, stored[d.id]).ready);
    return PROVIDERS.map((descriptor) => this.buildEntry(descriptor, stored[descriptor.id], llmReady));
  }

  async list(userId: string): Promise<ProviderView[]> {
    const [entries, usage] = await Promise.all([this.entries(userId), this.usage.getAllUsage(userId)]);
    return entries.map((entry) => this.toView(entry, usage[entry.id]));
  }

  async update(userId: string, id: string, patch: ProviderPatch): Promise<ProviderView> {
    const descriptor = findDescriptor(id);
    if (!descriptor) throw notFound(`Unknown provider "${id}".`);

    const configs = await this.storage.getProviderConfigs(userId);
    const next: StoredProviderConfig = { ...(configs[id] ?? defaultStoredConfig(descriptor)) };
    if (patch.enabled !== undefined) next.enabled = patch.enabled;
    if (patch.priority !== undefined) next.priority = patch.priority;
    if (patch.clearApiKey) next.apiKeyEnc = null;
    if (patch.apiKey !== undefined) next.apiKeyEnc = patch.apiKey ? encryptSecret(patch.apiKey, this.key) : null;
    if (patch.baseUrl) {
      if (!descriptor.supportsBaseUrl) throw badRequest(`${descriptor.name} does not accept a custom base URL.`);
      next.baseUrl = patch.baseUrl;
    } else if (patch.baseUrl === null) {
      next.baseUrl = null;
    }
    if (patch.model !== undefined) next.model = patch.model;
    if (patch.region !== undefined) next.region = patch.region;
    await this.storage.saveProviderConfig(userId, descriptor.id, next);

    return this.viewOf(userId, descriptor.id);
  }

  /** Translation providers bound to this user's LLM chain. Build per request. */
  translators(userId: string): Map<ProviderId, TranslationProvider> {
    const runLlm: LlmRunner = (input, parse, chars) => this.runLlm(userId, input, parse, chars);
    return createTranslationProviders({ timeoutMs: this.timeoutMs, runLlm });
  }

  /** Runs a generation through the ready LLM providers in priority order. */
  async runLlm<T>(
    userId: string,
    input: GenerateInput,
    parse: (raw: string) => T,
    chars: number = input.prompt.length,
  ): Promise<ChainResult<T>> {
    const entries = (await this.entries(userId))
      .filter((entry) => entry.descriptor.kind === 'llm' && entry.ready)
      .sort(byPriority);
    if (entries.length === 0) throw notConfigured(NO_LLM_MESSAGE);

    return this.runChain(userId, entries, {
      chars,
      signal: input.signal,
      run: async (entry, signal) => {
        const provider = this.llmProviders.get(entry.id);
        if (!provider) throw new ProviderError(entry.id, `${entry.descriptor.name} is not implemented.`, 'config');
        const out = await provider.generate({ ...input, signal }, entry.cfg);
        let value: T;
        try {
          value = parse(out.text);
        } catch {
          throw new ProviderError(entry.id, `${entry.descriptor.name} returned a response that could not be used.`, 'parse');
        }
        return { value, model: out.model, tokens: out.tokens };
      },
    });
  }

  /**
   * Tries each entry in order. Records usage and last errors, skips unsupported
   * language pairs, and throws PROVIDER_ERROR / PROVIDER_TIMEOUT when all fail.
   */
  async runChain<T>(userId: string, entries: ProviderEntry[], options: ChainOptions<T>): Promise<ChainResult<T>> {
    const failures: Failure[] = [];
    const skipped: Failure[] = [];

    for (const entry of entries) {
      if (options.signal.aborted) throw new Error('Request was cancelled.');
      const started = Date.now();
      let result: LlmRunResult<T>;
      try {
        result = await options.run(entry, options.signal);
      } catch (err) {
        if (options.signal.aborted) throw err;
        const message = describeError(err);
        if (err instanceof UnsupportedLanguageError) {
          skipped.push({ provider: entry.id, message, timeout: false });
          continue;
        }
        await bookkeeping('usage', () =>
          this.usage.recordCall(userId, entry.id, {
            chars: options.chars,
            latencyMs: Date.now() - started,
            ok: false,
          }),
        );
        await bookkeeping('error', () => this.recordError(userId, entry.descriptor, message));
        failures.push({ provider: entry.id, message, timeout: err instanceof ProviderTimeoutError });
        continue;
      }

      const latencyMs = Date.now() - started;
      await bookkeeping('usage', () =>
        this.usage.recordCall(userId, entry.id, {
          chars: options.chars,
          latencyMs,
          ok: true,
          tokens: result.tokens,
        }),
      );
      await bookkeeping('error', () => this.clearError(userId, entry));
      return { value: result.value, provider: entry.id, model: result.model, latencyMs };
    }

    if (failures.length === 0) {
      const details = skipped.map(({ provider, message }) => ({ provider, message }));
      throw providerFailed('No configured provider supports this request.', details);
    }
    const details = failures.map(({ provider, message }) => ({ provider, message }));
    if (failures.every((failure) => failure.timeout)) {
      throw providerTimeout('Every provider timed out. Try again in a moment.', details);
    }
    throw providerFailed('Every provider failed for this request. Check the provider settings.', details);
  }

  /** Runs one tiny real request against a provider. Never throws; failures come back as ok:false. */
  async test(userId: string, id: string): Promise<ProviderTestResponse> {
    const entry = (await this.entries(userId)).find((item) => item.id === id);
    if (!entry) throw notFound(`Unknown provider "${id}".`);
    if (!entry.ready) return { ok: false, latencyMs: 0, message: entry.notReadyReason ?? 'Not ready.' };

    const started = Date.now();
    const signal = AbortSignal.timeout(this.timeoutMs);
    try {
      let sample = '';
      if (entry.descriptor.kind === 'llm') {
        const provider = this.llmProviders.get(entry.id);
        if (!provider) throw new ProviderError(entry.id, 'Provider is not implemented.', 'config');
        const out = await provider.generate(
          { system: 'You are a connectivity check.', prompt: 'Reply with exactly: OK', temperature: 0, maxTokens: 20, signal },
          entry.cfg,
        );
        sample = out.text;
      } else {
        const translator = this.translators(userId).get(entry.id);
        if (!translator) throw new ProviderError(entry.id, 'Provider is not implemented.', 'config');
        const out = await translator.translate(
          { text: 'Hello, how are you?', source: 'en', target: 'es', signal },
          entry.cfg,
        );
        sample = out.text;
      }
      await bookkeeping('error', () => this.clearError(userId, entry));
      return {
        ok: true,
        latencyMs: Date.now() - started,
        message: 'Connected. The provider answered the test request.',
        sample: clip(sample.trim(), 200),
      };
    } catch (err) {
      const message = describeError(err);
      await bookkeeping('error', () => this.recordError(userId, entry.descriptor, message));
      return { ok: false, latencyMs: Date.now() - started, message };
    }
  }

  private async viewOf(userId: string, id: ProviderId): Promise<ProviderView> {
    const [entries, usage] = await Promise.all([this.entries(userId), this.usage.getAllUsage(userId)]);
    const entry = entries.find((item) => item.id === id);
    if (!entry) throw notFound(`Unknown provider "${id}".`);
    return this.toView(entry, usage[id]);
  }

  private toView(entry: ProviderEntry, usage: ProviderUsageRecord | undefined): ProviderView {
    const key = entry.cfg.apiKey;
    return {
      id: entry.id,
      kind: entry.descriptor.kind,
      capabilities: [...entry.descriptor.capabilities],
      enabled: entry.stored.enabled,
      priority: entry.stored.priority,
      hasApiKey: entry.hasApiKey,
      apiKeySource: entry.apiKeySource,
      apiKeyPreview: key ? (key.length > 8 ? `••••${key.slice(-4)}` : '••••') : null,
      baseUrl: entry.explicitBaseUrl,
      model: entry.cfg.model,
      region: entry.cfg.region,
      ready: entry.ready,
      notReadyReason: entry.notReadyReason,
      usage: summarizeUsage(usage, this.now()),
      lastError: entry.stored.lastError,
    };
  }

  private buildEntry(descriptor: ProviderDescriptor, record: StoredProviderConfig | undefined, llmReady = false): ProviderEntry {
    const stored = record ?? defaultStoredConfig(descriptor);
    const { apiKey, source } = this.resolveApiKey(descriptor, stored);
    // A stored base URL is only honoured for providers that support one, so a stale value cannot redirect keys.
    const storedBaseUrl = descriptor.supportsBaseUrl ? stored.baseUrl : null;
    const explicitBaseUrl = storedBaseUrl ?? this.envBaseUrl(descriptor.id);
    // LibreTranslate has no public host, so it is only ready once a URL is explicitly configured.
    const baseUrl = explicitBaseUrl ?? (descriptor.id === 'libretranslate' ? null : descriptor.defaultBaseUrl ?? null);
    const region =
      stored.region ?? (descriptor.id === 'azure' ? this.config.providerEnv.AZURE_TRANSLATOR_REGION ?? null : null);
    const cfg: ResolvedProviderConfig = {
      id: descriptor.id,
      apiKey,
      baseUrl,
      model: stored.model ?? descriptor.defaultModel ?? null,
      region,
    };
    const notReadyReason = this.notReadyReason(descriptor, stored, cfg, llmReady);
    return {
      id: descriptor.id,
      descriptor,
      stored,
      cfg,
      hasApiKey: apiKey !== null,
      apiKeySource: source,
      explicitBaseUrl,
      ready: notReadyReason === null,
      notReadyReason,
    };
  }

  private notReadyReason(
    descriptor: ProviderDescriptor,
    stored: StoredProviderConfig,
    cfg: ResolvedProviderConfig,
    llmReady: boolean,
  ): string | null {
    if (!stored.enabled) return 'Disabled';
    if (descriptor.id === 'llm') return llmReady ? null : 'No AI model provider is ready';
    if (descriptor.requiresApiKey && !cfg.apiKey) return 'API key required';
    if (descriptor.supportsBaseUrl && !cfg.baseUrl) return 'Base URL required';
    return null;
  }

  /** Settings key first, then the environment. An undecryptable stored key counts as missing. */
  private resolveApiKey(
    descriptor: ProviderDescriptor,
    stored: StoredProviderConfig,
  ): { apiKey: string | null; source: 'settings' | 'env' | null } {
    if (stored.apiKeyEnc) {
      try {
        return { apiKey: decryptSecret(stored.apiKeyEnc, this.key), source: 'settings' };
      } catch {
        // Fall through: the encryption key changed or the record is damaged.
      }
    }
    const fromEnv = descriptor.envKey ? this.config.providerEnv[descriptor.envKey] : undefined;
    return fromEnv ? { apiKey: fromEnv, source: 'env' } : { apiKey: null, source: null };
  }

  private envBaseUrl(id: ProviderId): string | null {
    const env = this.config.providerEnv;
    if (id === 'ollama') return env.OLLAMA_BASE_URL ?? null;
    if (id === 'libretranslate') return env.LIBRETRANSLATE_URL ?? null;
    return null;
  }

  private async recordError(userId: string, descriptor: ProviderDescriptor, message: string): Promise<void> {
    const configs = await this.storage.getProviderConfigs(userId);
    const current = configs[descriptor.id] ?? defaultStoredConfig(descriptor);
    await this.storage.saveProviderConfig(userId, descriptor.id, {
      ...current,
      lastError: { message: clip(message, 300), at: this.now().toISOString() },
    });
  }

  private async clearError(userId: string, entry: ProviderEntry): Promise<void> {
    if (!entry.stored.lastError) return;
    const configs = await this.storage.getProviderConfigs(userId);
    const current = configs[entry.id];
    if (!current?.lastError) return;
    await this.storage.saveProviderConfig(userId, entry.id, { ...current, lastError: null });
  }
}
