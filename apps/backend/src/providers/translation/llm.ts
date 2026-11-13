import { z } from 'zod';
import { buildDetectPrompt, buildTranslationPrompt, outputTokenBudget } from '../../services/prompts';
import { parseLlmJson } from '../../utils/json';
import { cleanModelOutput, normalizeLanguage } from '../../utils/text';
import type { LlmRunner, TranslationProvider } from '../types';

const translationSchema = z.object({
  translation: z.string(),
  detectedLanguage: z.string().catch(''),
  romanized: z.boolean().catch(false),
});

const detectSchema = z.object({
  language: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
});

/** Translation through the LLM fallback chain (translator id "llm"). */
export function createLlmTranslator(runLlm: LlmRunner): TranslationProvider {
  return {
    id: 'llm',
    async translate(input) {
      const prompt = buildTranslationPrompt({
        text: input.text,
        source: input.source,
        target: input.target,
        tone: input.tone,
        style: input.style,
      });
      const { value, model } = await runLlm(
        {
          system: prompt.system,
          prompt: prompt.prompt,
          json: true,
          temperature: 0.3,
          maxTokens: outputTokenBudget(input.text.length),
          signal: input.signal,
        },
        (raw) => {
          const parsed = parseLlmJson(raw, translationSchema);
          const text = cleanModelOutput(parsed.translation, input.text);
          if (!text) throw new Error('The translation was empty.');
          return { ...parsed, translation: text };
        },
        input.text.length,
      );
      const detected = normalizeLanguage(value.detectedLanguage);
      return {
        text: value.translation,
        detectedSourceLang: detected || undefined,
        romanized: value.romanized,
        model,
      };
    },
    async detect(text, _cfg, signal) {
      const prompt = buildDetectPrompt(text);
      const { value } = await runLlm(
        { system: prompt.system, prompt: prompt.prompt, json: true, temperature: 0, maxTokens: 120, signal },
        (raw) => parseLlmJson(raw, detectSchema),
        text.length,
      );
      return { language: normalizeLanguage(value.language), confidence: value.confidence };
    },
  };
}
