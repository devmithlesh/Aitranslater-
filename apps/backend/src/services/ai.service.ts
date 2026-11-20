import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  ASSISTANT_TOOL_INSTRUCTIONS,
  buildAssistantPrompt,
  buildExplainPrompt,
  buildGrammarPrompt,
  buildReplyVariantsPrompt,
  describeLanguage,
  buildRewritePrompt,
  buildSmartReplyPrompt,
  buildSummarizePrompt,
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
  AssistantRunRequest,
  AssistantRunResponse,
  ClientKind,
  CustomAssistant,
  CustomAssistantInput,
  ExplainRequest,
  ExplainResponse,
  GrammarIssue,
  GrammarRequest,
  GrammarResponse,
  RewriteRequest,
  ProviderMeta,
  RewriteResponse,
  ReplyVariantsRequest,
  ReplyVariantsResponse,
  SmartReplyRequest,
  SmartReplyResponse,
  SummarizeRequest,
  SummarizeResponse,
  TranslateVariantsRequest,
  TranslateVariantsResponse,
  TranslationVariant,
  WriteRequest,
  WriteResponse,
} from '@verba/shared';
import { LOCAL_USER_ID } from '../middleware/auth';
import { badRequest, notFound } from '../utils/errors';
import { parseLlmJson } from '../utils/json';
import { cleanModelOutput, normalizeDetectedLanguage } from '../utils/text';
import type { Storage } from '../storage/types';
import type { ChainResult, ProviderRegistry } from './provider-registry';
import type { HistoryService } from './history.service';
import type { SettingsService } from './settings.service';
import type { TranslationService } from './translation.service';

const grammarSchema = z.object({
  corrected: z.string(),
  issues: z
    .array(
      z.object({
        type: z.enum(['grammar', 'spelling', 'punctuation', 'style', 'clarity']).catch('grammar'),
        original: z.string().catch(''),
        replacement: z.string().catch(''),
        explanation: z.string().catch(''),
      }),
    )
    .catch([]),
});

const repliesSchema = z.object({ replies: z.array(z.string()) });

const translationVariantsSchema = z.object({
  meaning: z.string().catch(''),
  detectedLanguage: z.string().catch(''),
  romanized: z.boolean().catch(false),
  variants: z.record(z.unknown()).catch({}),
});

const MAX_ISSUES = 50;

function requireNonEmpty(raw: string, input: string): string {
  const out = cleanModelOutput(raw, input);
  if (!out) throw new Error('The output was empty.');
  return out;
}

function normalizeSpace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Keeps only corrections whose "original" really occurs in the input, and drops no-op replacements. */
function parseGrammar(raw: string, input: string): { corrected: string; issues: GrammarIssue[] } {
  const parsed = parseLlmJson(raw, grammarSchema);
  const corrected = requireNonEmpty(parsed.corrected, input);
  if (normalizeSpace(corrected) === normalizeSpace(input)) return { corrected, issues: [] };
  const issues = parsed.issues
    .filter((issue) => issue.original.length > 0 && input.includes(issue.original) && issue.replacement !== issue.original)
    .slice(0, MAX_ISSUES);
  return { corrected, issues };
}

function parseReplies(raw: string, context: string, count: number): string[] {
  const parsed = parseLlmJson(raw, repliesSchema);
  const replies = [...new Set(parsed.replies.map((reply) => cleanModelOutput(reply, context)).filter(Boolean))].slice(0, count);
  if (replies.length === 0) throw new Error('No replies were returned.');
  return replies;
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
    private readonly settings: SettingsService,
    private readonly history: HistoryService,
    private readonly translation: TranslationService,
    private readonly storage: Storage,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async grammar(args: { userId: string; client: ClientKind; request: GrammarRequest; signal: AbortSignal }): Promise<GrammarResponse> {
    const { userId, client, request, signal } = args;
    const settings = await this.settings.get(userId);
    const hint = request.language && request.language !== AUTO_LANGUAGE ? describeLanguage(request.language) : undefined;
    const prompt = buildGrammarPrompt(request.text, hint);
    const result = await this.registry.runLlm(
      userId,
      { ...prompt, json: true, temperature: 0.2, maxTokens: outputTokenBudget(request.text.length), signal },
      (raw) => parseGrammar(raw, request.text),
      request.text.length,
    );
    const historyId = await this.history.record({
      userId,
      client,
      type: 'grammar',
      input: request.text,
      output: result.value.corrected,
      meta: { provider: result.provider, model: result.model },
      languages: [],
      chars: request.text.length,
      saveHistory: settings.saveHistory,
    });
    return {
      corrected: result.value.corrected,
      issues: result.value.issues,
      ...this.meta(result, historyId),
    };
  }

  async rewrite(args: { userId: string; client: ClientKind; request: RewriteRequest; signal: AbortSignal }): Promise<RewriteResponse> {
    const { userId, client, request, signal } = args;
    const settings = await this.settings.get(userId);
    const prompt = buildRewritePrompt({
      text: request.text,
      style: request.style,
      customInstructions: request.customInstructions,
    });
    const result = await this.generateText(userId, prompt, request.text, 0.5, signal);
    const historyId = await this.history.record({
      userId,
      client,
      type: 'rewrite',
      input: request.text,
      output: result.value,
      meta: { provider: result.provider, model: result.model, style: request.style },
      languages: [],
      chars: request.text.length,
      saveHistory: settings.saveHistory,
    });
    return { result: result.value, ...this.meta(result, historyId) };
  }

  async summarize(args: { userId: string; client: ClientKind; request: SummarizeRequest; signal: AbortSignal }): Promise<SummarizeResponse> {
    const { userId, client, request, signal } = args;
    const settings = await this.settings.get(userId);
    const format = request.format ?? settings.defaultSummaryFormat;
    const prompt = buildSummarizePrompt({ text: request.text, format });
    const result = await this.generateText(userId, prompt, request.text, 0.3, signal);
    const historyId = await this.history.record({
      userId,
      client,
      type: 'summarize',
      input: request.text,
      output: result.value,
      meta: { provider: result.provider, model: result.model, format },
      languages: [],
      chars: request.text.length,
      saveHistory: settings.saveHistory,
    });
    return { result: result.value, ...this.meta(result, historyId) };
  }

  async write(args: { userId: string; client: ClientKind; request: WriteRequest; signal: AbortSignal }): Promise<WriteResponse> {
    const { userId, client, request, signal } = args;
    const settings = await this.settings.get(userId);
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
    const historyId = await this.history.record({
      userId,
      client,
      type: 'assistant',
      input: request.prompt || '[picture]',
      output: result.value,
      meta: { provider: result.provider, model: result.model, targetLang, assistantName: 'Write' },
      languages: [targetLang],
      chars: request.prompt.length,
      saveHistory: settings.saveHistory,
    });
    return { result: result.value, ...this.meta(result, historyId) };
  }

  async explain(args: { userId: string; client: ClientKind; request: ExplainRequest; signal: AbortSignal }): Promise<ExplainResponse> {
    const { userId, client, request, signal } = args;
    const settings = await this.settings.get(userId);
    const language = request.language ?? DEFAULT_EXPLAIN_LANGUAGE;
    const prompt = buildExplainPrompt({ text: request.text, language });
    const result = await this.generateText(userId, prompt, request.text, 0.4, signal);
    const historyId = await this.history.record({
      userId,
      client,
      type: 'assistant',
      input: request.text,
      output: result.value,
      meta: { provider: result.provider, model: result.model, toolId: 'explain' },
      languages: [],
      chars: request.text.length,
      saveHistory: settings.saveHistory,
    });
    return { result: result.value, ...this.meta(result, historyId) };
  }

  async smartReply(args: { userId: string; client: ClientKind; request: SmartReplyRequest; signal: AbortSignal }): Promise<SmartReplyResponse> {
    const { userId, client, request, signal } = args;
    const settings = await this.settings.get(userId);
    const count = request.count ?? 1;
    const prompt = buildSmartReplyPrompt({
      context: request.context,
      intent: request.intent,
      style: request.style,
      length: request.length,
      count,
    });
    const result = await this.registry.runLlm(
      userId,
      { ...prompt, json: true, temperature: 0.7, maxTokens: outputTokenBudget(request.context.length), signal },
      (raw) => parseReplies(raw, request.context, count),
      request.context.length,
    );
    const historyId = await this.history.record({
      userId,
      client,
      type: 'smart-reply',
      input: request.context,
      output: result.value.join('\n\n'),
      meta: { provider: result.provider, model: result.model, style: request.style },
      languages: [],
      chars: request.context.length,
      saveHistory: settings.saveHistory,
    });
    return { replies: result.value, ...this.meta(result, historyId) };
  }

  /** Reply drafts for a received message, one per style. Same LLM path and parser as translateVariants. */
  async replyVariants(args: {
    userId: string;
    client: ClientKind;
    request: ReplyVariantsRequest;
    signal: AbortSignal;
  }): Promise<ReplyVariantsResponse> {
    const { userId, client, request, signal } = args;
    const settings = await this.settings.get(userId);
    const targetLang = request.targetLang ?? 'en';
    const styles: readonly RewriteStyle[] = request.styles ?? [...DEFAULT_VARIANT_STYLES];
    const prompt = buildReplyVariantsPrompt({
      message: request.message,
      intent: request.intent,
      targetLanguageName: describeLanguage(targetLang),
      styles,
    });
    // Users have no AI keys of their own: the admin's provider chain serves the call.
    // Settings and history stay with the caller (userId).
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
    let historyId: string | undefined;
    try {
      historyId = await this.history.record({
        userId,
        client,
        type: 'assistant',
        input: request.message,
        output: result.value.variants.map((variant) => variant.text).join('\n\n'),
        meta: { provider: result.provider, model: result.model, targetLang, assistantName: 'Reply' },
        languages: [targetLang],
        chars: request.message.length,
        saveHistory: settings.saveHistory,
      });
    } catch (err) {
      console.warn('[verba] could not record history:', err instanceof Error ? err.message : err);
    }
    return { variants: result.value.variants, ...this.meta(result, historyId) };
  }

  async translateVariants(args: {
    userId: string;
    client: ClientKind;
    request: TranslateVariantsRequest;
    signal: AbortSignal;
  }): Promise<TranslateVariantsResponse> {
    const { userId, client, request, signal } = args;
    const settings = await this.settings.get(userId);
    const styles: readonly RewriteStyle[] = request.styles ?? [...DEFAULT_VARIANT_STYLES];
    const prompt = buildTranslationVariantsPrompt({
      text: request.text,
      source: request.sourceLang,
      target: request.targetLang,
      styles,
    });
    // Users have no AI keys of their own: the admin's provider chain and usage serve every account.
    // Settings and history stay with the caller (userId).
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
    let historyId: string | undefined;
    try {
      historyId = await this.history.record({
        userId,
        client,
        type: 'translate',
        input: request.text,
        output: result.value.variants.map((variant) => variant.text).join('\n\n'),
        meta: {
          provider: result.provider,
          model: result.model,
          sourceLang: request.sourceLang,
          targetLang: request.targetLang,
          detectedLang: detected,
          romanized: result.value.romanized,
        },
        languages: [request.targetLang, ...(detected ? [detected] : [])],
        chars: request.text.length,
        saveHistory: settings.saveHistory,
      });
    } catch (err) {
      console.warn('[verba] could not record history:', err instanceof Error ? err.message : err);
    }
    return {
      meaning: result.value.meaning,
      variants: result.value.variants,
      detectedSourceLang: detected,
      romanized: result.value.romanized,
      ...this.meta(result, historyId),
    };
  }

  async runAssistant(args: { userId: string; client: ClientKind; request: AssistantRunRequest; signal: AbortSignal }): Promise<AssistantRunResponse> {
    const { userId, client, request, signal } = args;
    const settings = await this.settings.get(userId);

    if (request.toolId === 'translate') {
      const targetLang = request.targetLang ?? settings.defaultTargetLang;
      const outcome = await this.translation.execute(
        userId,
        { text: request.text, sourceLang: AUTO_LANGUAGE, targetLang },
        signal,
        settings,
      );
      const historyId = await this.history.record({
        userId,
        client,
        type: 'assistant',
        input: request.text,
        output: outcome.translatedText,
        meta: {
          provider: outcome.provider,
          model: outcome.model,
          sourceLang: AUTO_LANGUAGE,
          targetLang,
          detectedLang: outcome.detectedSourceLang,
          toolId: 'translate',
        },
        languages: [targetLang, ...(outcome.detectedSourceLang ? [outcome.detectedSourceLang] : [])],
        chars: request.text.length,
        saveHistory: settings.saveHistory,
      });
      return {
        result: outcome.translatedText,
        provider: outcome.provider,
        model: outcome.model,
        latencyMs: outcome.latencyMs,
        historyId,
      };
    }

    const resolved = await this.resolveAssistant(userId, request);
    const prompt = buildAssistantPrompt({ instructions: resolved.instructions, text: request.text });
    const result = await this.generateText(userId, prompt, request.text, 0.5, signal);
    const historyId = await this.history.record({
      userId,
      client,
      type: 'assistant',
      input: request.text,
      output: result.value,
      meta: {
        provider: result.provider,
        model: result.model,
        toolId: request.toolId,
        assistantId: request.assistantId,
        assistantName: resolved.assistantName,
      },
      languages: [],
      chars: request.text.length,
      saveHistory: settings.saveHistory,
    });
    return { result: result.value, ...this.meta(result, historyId) };
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

  private async resolveAssistant(
    userId: string,
    request: AssistantRunRequest,
  ): Promise<{ instructions: string; assistantName?: string }> {
    if (request.assistantId) {
      const assistant = await this.storage.getAssistant(userId, request.assistantId);
      if (!assistant) throw notFound('Assistant not found.');
      return { instructions: assistant.instructions, assistantName: assistant.name };
    }
    if (!request.toolId) throw badRequest('Provide "toolId" or "assistantId".');
    if (request.toolId === 'custom') {
      const instructions = request.prompt?.trim();
      if (!instructions) throw badRequest('A custom prompt is required for toolId "custom".');
      return { instructions };
    }
    return { instructions: ASSISTANT_TOOL_INSTRUCTIONS[request.toolId] };
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

  private meta(result: ChainResult<unknown>, historyId?: string): ProviderMeta {
    return { provider: result.provider, model: result.model, latencyMs: result.latencyMs, historyId };
  }
}
