import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  buildExplainPrompt,
  buildReplyVariantsPrompt,
  describeLanguage,
  buildTranslationVariantsPrompt,
  buildWritePrompt,
  outputTokenBudget,
  variantsTokenBudget,
} from './prompts';
import type { Prompt } from './prompts';
import type { GenerateImage } from '../providers/types';
import { AUTO_LANGUAGE, DEFAULT_EXPLAIN_LANGUAGE, DEFAULT_VARIANT_STYLES } from '@verba/shared';
import type { RewriteStyle } from '@verba/shared';
import type {
  ClientKind,
  CustomAssistant,
  CustomAssistantInput,
  ExplainRequest,
  ExplainResponse,
  ProviderMeta,
  ReplyVariantsRequest,
  ReplyVariantsResponse,
  TranslateVariantsRequest,
  TranslateVariantsResponse,
  TranslationVariant,
  WriteRequest,
  WriteResponse,
} from '@verba/shared';
import { LOCAL_USER_ID } from '../middleware/auth';
import { notFound } from '../utils/errors';
import { parseLlmJson } from '../utils/json';
import { cleanModelOutput, normalizeDetectedLanguage } from '../utils/text';
import type { Storage } from '../storage/types';
import type { ChainResult, ProviderRegistry } from './provider-registry';
import type { ActivityService } from './activity.service';

const translationVariantsSchema = z.object({
  meaning: z.string().catch(''),
  detectedLanguage: z.string().catch(''),
  romanized: z.boolean().catch(false),
  variants: z.record(z.unknown()).catch({}),
});

function requireNonEmpty(raw: string, input: string): string {
  const out = cleanModelOutput(raw, input);
  if (!out) throw new Error('The output was empty.');
  return out;
}

/** Keeps variants in requested order, dropping styles the model skipped or left empty. */
function parseTranslationVariants(
  raw: string,
  input: string,
  styles: readonly RewriteStyle[],
): { meaning: string; variants: TranslationVariant[]; detectedLanguage: string; romanized: boolean } {
  const parsed = parseLlmJson(raw, translationVariantsSchema);
  const variants: TranslationVariant[] = [];
  for (const style of styles) {
    const value = parsed.variants[style];
    if (typeof value !== 'string') continue;
    const text = cleanModelOutput(value, input);
    if (text) variants.push({ style, text });
  }
  if (variants.length === 0) throw new Error('No translation variants were returned.');
  const meaning = cleanModelOutput(parsed.meaning, input) || variants[0].text;
  return { meaning, variants, detectedLanguage: parsed.detectedLanguage, romanized: parsed.romanized };
}

export class AiService {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly activity: ActivityService,
    private readonly storage: Storage,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async write(args: { userId: string; client: ClientKind; request: WriteRequest; signal: AbortSignal }): Promise<WriteResponse> {
    const { userId, client, request, signal } = args;
    // Write defaults to English; the popup can pick another language.
    const targetLang = request.targetLang ?? 'en';
    const images = request.images ?? [];
    const prompt = buildWritePrompt({
      prompt: request.prompt,
      targetLanguageName: describeLanguage(targetLang),
      hasImages: images.length > 0,
    });
    // A picture needs room for the answer even when no text was typed.
    const budgetInput = request.prompt.length > 0 ? request.prompt : 'x'.repeat(400);
    // Like translateVariants: users have no AI keys of their own, so the admin's provider chain serves the call.
    const result = await this.generateText(LOCAL_USER_ID, prompt, budgetInput, 0.6, signal, images);
    await this.activity.record({ userId, client, type: 'assistant', languages: [targetLang], chars: request.prompt.length });
    return { result: result.value, ...this.meta(result) };
  }

  async explain(args: { userId: string; client: ClientKind; request: ExplainRequest; signal: AbortSignal }): Promise<ExplainResponse> {
    const { userId, client, request, signal } = args;
    const language = request.language ?? DEFAULT_EXPLAIN_LANGUAGE;
    const prompt = buildExplainPrompt({ text: request.text, language });
    const result = await this.generateText(userId, prompt, request.text, 0.4, signal);
    await this.activity.record({ userId, client, type: 'assistant', languages: [], chars: request.text.length });
    return { result: result.value, ...this.meta(result) };
  }

  async replyVariants(args: {
    userId: string;
    client: ClientKind;
    request: ReplyVariantsRequest;
    signal: AbortSignal;
  }): Promise<ReplyVariantsResponse> {
    const { userId, client, request, signal } = args;
    const targetLang = request.targetLang ?? 'en';
    const styles: readonly RewriteStyle[] = request.styles ?? [...DEFAULT_VARIANT_STYLES];
    const prompt = buildReplyVariantsPrompt({
      message: request.message,
      intent: request.intent,
      targetLanguageName: describeLanguage(targetLang),
      styles,
    });
    // Users have no AI keys of their own: the admin's provider chain serves the call.
    // Settings stay with the caller (userId).
    const result = await this.registry.runLlm(
      LOCAL_USER_ID,
      {
        ...prompt,
        json: true,
        temperature: 0.7,
        maxTokens: variantsTokenBudget(request.message.length, styles.length),
        signal,
      },
      (raw) => parseTranslationVariants(raw, request.message, styles),
      request.message.length,
    );
    try {
      await this.activity.record({ userId, client, type: 'assistant', languages: [targetLang], chars: request.message.length });
    } catch (err) {
      console.warn('[verba] could not record usage:', err instanceof Error ? err.message : err);
    }
    return { variants: result.value.variants, ...this.meta(result) };
  }

  async translateVariants(args: {
    userId: string;
    client: ClientKind;
    request: TranslateVariantsRequest;
    signal: AbortSignal;
  }): Promise<TranslateVariantsResponse> {
    const { userId, client, request, signal } = args;
    const styles: readonly RewriteStyle[] = request.styles ?? [...DEFAULT_VARIANT_STYLES];
    const prompt = buildTranslationVariantsPrompt({
      text: request.text,
      source: request.sourceLang,
      target: request.targetLang,
      styles,
    });
    // Users have no AI keys of their own: the admin's provider chain and usage serve every account.
    // Settings stay with the caller (userId).
    const result = await this.registry.runLlm(
      LOCAL_USER_ID,
      {
        ...prompt,
        json: true,
        temperature: 0.7,
        maxTokens: variantsTokenBudget(request.text.length, styles.length),
        signal,
      },
      (raw) => parseTranslationVariants(raw, request.text, styles),
      request.text.length,
    );
    const detected =
      request.sourceLang === AUTO_LANGUAGE ? normalizeDetectedLanguage(result.value.detectedLanguage) : undefined;
    try {
      await this.activity.record({ userId, client, type: 'translate', languages: [request.targetLang, ...(detected ? [detected] : [])], chars: request.text.length });
    } catch (err) {
      console.warn('[verba] could not record usage:', err instanceof Error ? err.message : err);
    }
    return {
      meaning: result.value.meaning,
      variants: result.value.variants,
      detectedSourceLang: detected,
      romanized: result.value.romanized,
      ...this.meta(result),
    };
  }

  async listAssistants(userId: string): Promise<CustomAssistant[]> {
    return this.storage.listAssistants(userId);
  }

  async createAssistant(userId: string, input: CustomAssistantInput): Promise<CustomAssistant> {
    const timestamp = this.now().toISOString();
    const assistant: CustomAssistant = { id: randomUUID(), ...input, createdAt: timestamp, updatedAt: timestamp };
    await this.storage.saveAssistant(userId, assistant);
    return assistant;
  }

  async updateAssistant(userId: string, id: string, patch: Partial<CustomAssistantInput>): Promise<CustomAssistant> {
    const current = await this.storage.getAssistant(userId, id);
    if (!current) throw notFound('Assistant not found.');
    const next: CustomAssistant = { ...current, ...patch, updatedAt: this.now().toISOString() };
    await this.storage.saveAssistant(userId, next);
    return next;
  }

  async deleteAssistant(userId: string, id: string): Promise<void> {
    const removed = await this.storage.deleteAssistant(userId, id);
    if (!removed) throw notFound('Assistant not found.');
  }

  private generateText(
    userId: string,
    prompt: Prompt,
    input: string,
    temperature: number,
    signal: AbortSignal,
    images?: GenerateImage[],
  ): Promise<ChainResult<string>> {
    return this.registry.runLlm(
      userId,
      {
        system: prompt.system,
        prompt: prompt.prompt,
        images: images?.length ? images : undefined,
        temperature,
        maxTokens: outputTokenBudget(input.length),
        signal,
      },
      (raw) => requireNonEmpty(raw, input),
      input.length,
    );
  }

  private meta(result: ChainResult<unknown>): ProviderMeta {
    return { provider: result.provider, model: result.model, latencyMs: result.latencyMs };
  }
}
