import type { LlmProviderId, ProviderId, TranslationProviderId } from '@verba/shared';
import { createLlmTranslator } from './translation/llm';
import { createAzureProvider } from './translation/azure';
import { createDeeplProvider } from './translation/deepl';
import { createGoogleProvider } from './translation/google';
import { createLibreTranslateProvider } from './translation/libretranslate';
import { createMyMemoryProvider } from './translation/mymemory';
import { createGeminiProvider } from './llm/gemini';
import { createOpenAiCompatibleProvider } from './llm/openai-compatible';
import type { HttpOptions } from './http';
import type { LlmProvider, LlmRunner, TranslationProvider } from './types';

export function createTranslationProviders(options: HttpOptions & { runLlm: LlmRunner }): Map<ProviderId, TranslationProvider> {
  const translators: [TranslationProviderId, TranslationProvider][] = [
    ['mymemory', createMyMemoryProvider(options)],
    ['libretranslate', createLibreTranslateProvider(options)],
    ['azure', createAzureProvider(options)],
    ['google', createGoogleProvider(options)],
    ['deepl', createDeeplProvider(options)],
    ['llm', createLlmTranslator(options.runLlm)],
  ];
  return new Map<ProviderId, TranslationProvider>(translators);
}

export function createLlmProviders(options: HttpOptions): Map<ProviderId, LlmProvider> {
  const ids: LlmProviderId[] = ['gemini', 'groq', 'openrouter', 'openai', 'ollama', 'openai-compatible'];
  const providers = ids.map((id): [LlmProviderId, LlmProvider] => [
    id,
    id === 'gemini' ? createGeminiProvider(options) : createOpenAiCompatibleProvider(id, options),
  ]);
  return new Map<ProviderId, LlmProvider>(providers);
}
