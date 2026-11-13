import { AUTO_LANGUAGE } from '@verba/shared';
import type {
  ClientKind,
  DetectLanguageResponse,
  ProviderId,
  TranslateRequest,
  TranslateResponse,
  UserSettings,
} from '@verba/shared';
import { badRequest, notConfigured } from '../utils/errors';
import { normalizeDetectedLanguage } from '../utils/text';
import { ProviderError } from '../providers/types';
import { byPriority } from './provider-registry';
import type { ProviderEntry, ProviderRegistry } from './provider-registry';
import type { HistoryService } from './history.service';
import type { SettingsService } from './settings.service';

export interface TranslationOutcome {
  translatedText: string;
  provider: ProviderId;
  model?: string;
  latencyMs: number;
  detectedSourceLang?: string;
  romanized?: boolean;
}

/** Picks the providers to try: a styled request is LLM-only; an explicit provider is used alone. */
function selectCandidates(entries: ProviderEntry[], request: TranslateRequest): ProviderEntry[] {
  if (request.style) {
    if (request.provider && request.provider !== 'llm') {
      throw badRequest('Styled translations always use the AI model ("llm") provider.');
    }
    const llm = entries.find((entry) => entry.id === 'llm');
    if (!llm?.ready) {
      throw notConfigured(
        'Styled translations need an AI model provider. Add a Gemini/Groq/OpenRouter key or enable Ollama.',
      );
    }
    return [llm];
  }

  if (request.provider) {
    const picked = entries.find((entry) => entry.id === request.provider);
    if (!picked?.ready) {
      const reason = picked?.notReadyReason ?? 'not configured';
      throw notConfigured(`${picked?.descriptor.name ?? request.provider} is not ready: ${reason}.`);
    }
    return [picked];
  }

  const ready = entries.filter((entry) => entry.ready).sort(byPriority);
  if (ready.length === 0) {
    throw notConfigured(
      'No translation provider is ready. MyMemory works without a key; enable it or add a key for Azure, Google or DeepL.',
    );
  }
  return ready;
}

export class TranslationService {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly settings: SettingsService,
    private readonly history: HistoryService,
  ) {}

  /** Runs the translation chain without recording history (used by translate and the assistant). */
  async execute(
    userId: string,
    request: TranslateRequest,
    signal: AbortSignal,
    settings: UserSettings,
  ): Promise<TranslationOutcome> {
    const entries = (await this.registry.entries(userId)).filter((entry) => entry.descriptor.kind === 'translation');
    const candidates = selectCandidates(entries, request);
    const translators = this.registry.translators(userId);
    const tone = request.tone ?? settings.translationTone;
    const text = request.text;

    const chain = await this.registry.runChain(userId, candidates, {
      chars: text.length,
      signal,
      run: async (entry, callSignal) => {
        const translator = translators.get(entry.id);
        if (!translator) throw new ProviderError(entry.id, `${entry.descriptor.name} is not implemented.`, 'config');
        const out = await translator.translate(
          {
            text,
            source: request.sourceLang,
            target: request.targetLang,
            tone,
            style: request.style,
            signal: callSignal,
          },
          entry.cfg,
        );
        if (!out.text.trim()) throw new ProviderError(entry.id, `${entry.descriptor.name} returned an empty translation.`);
        return { value: out, model: out.model ?? entry.cfg.model ?? undefined };
      },
    });

    const detected =
      request.sourceLang === AUTO_LANGUAGE ? normalizeDetectedLanguage(chain.value.detectedSourceLang ?? '') : undefined;
    return {
      translatedText: chain.value.text.trim(),
      provider: chain.provider,
      model: chain.model,
      latencyMs: chain.latencyMs,
      detectedSourceLang: detected,
      romanized: chain.value.romanized,
    };
  }

  async translate(args: {
    userId: string;
    client: ClientKind;
    request: TranslateRequest;
    signal: AbortSignal;
  }): Promise<TranslateResponse> {
    const { userId, client, request, signal } = args;
    const settings = await this.settings.get(userId);
    const outcome = await this.execute(userId, request, signal, settings);

    let historyId: string | undefined;
    try {
      historyId = await this.history.record({
        userId,
        client,
        type: 'translate',
        input: request.text,
        output: outcome.translatedText,
        meta: {
          provider: outcome.provider,
          model: outcome.model,
          sourceLang: request.sourceLang,
          targetLang: request.targetLang,
          detectedLang: outcome.detectedSourceLang,
          tone: request.tone ?? settings.translationTone,
          style: request.style,
          romanized: outcome.romanized,
        },
        languages: [request.targetLang, ...(outcome.detectedSourceLang ? [outcome.detectedSourceLang] : [])],
        chars: request.text.length,
        saveHistory: settings.saveHistory,
      });
    } catch (err) {
      console.warn('[verba] could not record history:', err instanceof Error ? err.message : err);
    }

    return {
      translatedText: outcome.translatedText,
      style: request.style,
      detectedSourceLang: outcome.detectedSourceLang,
      provider: outcome.provider,
      model: outcome.model,
      latencyMs: outcome.latencyMs,
      historyId,
    };
  }

  async detect(userId: string, text: string, signal: AbortSignal): Promise<DetectLanguageResponse> {
    const entries = (await this.registry.entries(userId))
      .filter(
        (entry) =>
          entry.descriptor.kind === 'translation' && entry.ready && entry.descriptor.capabilities.includes('detect'),
      )
      .sort(byPriority);
    if (entries.length === 0) {
      throw notConfigured('No language detection provider is ready. Enable the AI model, or add a key for Azure or Google.');
    }

    const translators = this.registry.translators(userId);
    const chain = await this.registry.runChain(userId, entries, {
      chars: text.length,
      signal,
      run: async (entry, callSignal) => {
        const translator = translators.get(entry.id);
        if (!translator?.detect) {
          throw new ProviderError(entry.id, `${entry.descriptor.name} cannot detect languages.`, 'config');
        }
        const out = await translator.detect(text, entry.cfg, callSignal);
        const language = normalizeDetectedLanguage(out.language);
        if (!language) throw new ProviderError(entry.id, `${entry.descriptor.name} returned no recognized language.`);
        return { value: { language, confidence: out.confidence }, model: entry.cfg.model ?? undefined };
      },
    });

    return {
      language: chain.value.language,
      confidence: chain.value.confidence,
      provider: chain.provider,
      model: chain.model,
      latencyMs: chain.latencyMs,
    };
  }
}
