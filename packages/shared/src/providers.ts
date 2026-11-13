/**
 * Provider metadata. Free-tier notes describe the provider's published
 * limits at the time of writing — they change, so the UI must always show
 * them as "verify on the provider's pricing page", never as a guarantee.
 */

export const TRANSLATION_PROVIDER_IDS = ['mymemory', 'libretranslate', 'azure', 'google', 'deepl', 'llm'] as const;
export type TranslationProviderId = (typeof TRANSLATION_PROVIDER_IDS)[number];

export const LLM_PROVIDER_IDS = ['gemini', 'groq', 'openrouter', 'openai', 'ollama', 'openai-compatible'] as const;
export type LlmProviderId = (typeof LLM_PROVIDER_IDS)[number];

export type ProviderId = TranslationProviderId | LlmProviderId;
export type ProviderKind = 'translation' | 'llm';
export type ProviderCapability = 'translate' | 'detect' | 'generate';

export interface ProviderDescriptor {
  id: ProviderId;
  kind: ProviderKind;
  name: string;
  description: string;
  capabilities: ProviderCapability[];
  requiresApiKey: boolean;
  /** Provider accepts/needs a custom base URL (self-hosted or compatible APIs). */
  supportsBaseUrl: boolean;
  defaultBaseUrl?: string;
  supportsModel: boolean;
  defaultModel?: string;
  /** Azure Translator resource region. */
  supportsRegion: boolean;
  selfHosted: boolean;
  freeTier: string;
  docsUrl: string;
  /** Name of the backend env var that can supply the key instead of the UI. */
  envKey?: string;
}

export const PROVIDERS: readonly ProviderDescriptor[] = [
  // ── Translation ───────────────────────────────────────────────────
  {
    id: 'mymemory',
    kind: 'translation',
    name: 'MyMemory',
    description: 'Zero-setup public translation API. Great default for personal use; quality varies on long text.',
    capabilities: ['translate'],
    requiresApiKey: false,
    supportsBaseUrl: false,
    supportsModel: false,
    supportsRegion: false,
    selfHosted: false,
    freeTier: '~5,000 chars/day anonymous; ~50,000/day when a contact email is set as the "API key".',
    docsUrl: 'https://mymemory.translated.net/doc/spec.php',
    envKey: 'MYMEMORY_EMAIL',
  },
  {
    id: 'libretranslate',
    kind: 'translation',
    name: 'LibreTranslate',
    description: 'Open-source, self-hostable translation. Run it locally with Docker for unlimited private use.',
    capabilities: ['translate', 'detect'],
    requiresApiKey: false,
    supportsBaseUrl: true,
    defaultBaseUrl: 'http://localhost:5000',
    supportsModel: false,
    supportsRegion: false,
    selfHosted: true,
    freeTier: 'Unlimited when self-hosted. The hosted libretranslate.com instance requires a paid key.',
    docsUrl: 'https://github.com/LibreTranslate/LibreTranslate',
    envKey: 'LIBRETRANSLATE_API_KEY',
  },
  {
    id: 'azure',
    kind: 'translation',
    name: 'Azure AI Translator',
    description: 'High-quality neural translation with language detection. Requires an Azure Translator resource.',
    capabilities: ['translate', 'detect'],
    requiresApiKey: true,
    supportsBaseUrl: false,
    defaultBaseUrl: 'https://api.cognitive.microsofttranslator.com',
    supportsModel: false,
    supportsRegion: true,
    selfHosted: false,
    freeTier: 'F0 tier: 2M characters/month.',
    docsUrl: 'https://learn.microsoft.com/azure/ai-services/translator/',
    envKey: 'AZURE_TRANSLATOR_KEY',
  },
  {
    id: 'google',
    kind: 'translation',
    name: 'Google Cloud Translation',
    description: 'Google Translation API (Basic v2) using an API key.',
    capabilities: ['translate', 'detect'],
    requiresApiKey: true,
    supportsBaseUrl: false,
    defaultBaseUrl: 'https://translation.googleapis.com',
    supportsModel: false,
    supportsRegion: false,
    selfHosted: false,
    freeTier: 'First 500,000 characters/month free (billing account required).',
    docsUrl: 'https://cloud.google.com/translate/docs/basic/translating-text',
    envKey: 'GOOGLE_TRANSLATE_API_KEY',
  },
  {
    id: 'deepl',
    kind: 'translation',
    name: 'DeepL',
    description: 'Very natural translations with formality control. Free keys end in ":fx".',
    capabilities: ['translate'],
    requiresApiKey: true,
    supportsBaseUrl: false,
    supportsModel: false,
    supportsRegion: false,
    selfHosted: false,
    freeTier: 'DeepL API Free: 500,000 characters/month.',
    docsUrl: 'https://developers.deepl.com/docs',
    envKey: 'DEEPL_API_KEY',
  },
  {
    id: 'llm',
    kind: 'translation',
    name: 'AI model (LLM)',
    description: 'Translate with your configured AI model. Best for tone-aware, context-preserving translations.',
    capabilities: ['translate', 'detect'],
    requiresApiKey: false,
    supportsBaseUrl: false,
    supportsModel: false,
    supportsRegion: false,
    selfHosted: false,
    freeTier: 'Uses the quota of your active AI provider.',
    docsUrl: '',
  },
  // ── LLM ───────────────────────────────────────────────────────────
  {
    id: 'gemini',
    kind: 'llm',
    name: 'Google Gemini',
    description: 'Fast, capable models with a generous free tier via Google AI Studio.',
    capabilities: ['generate'],
    requiresApiKey: true,
    supportsBaseUrl: false,
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    supportsModel: true,
    defaultModel: 'gemini-3.5-flash-lite',
    supportsRegion: false,
    selfHosted: false,
    freeTier: 'Free tier with per-minute and per-day request caps that vary by model.',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/rate-limits',
    envKey: 'GEMINI_API_KEY',
  },
  {
    id: 'groq',
    kind: 'llm',
    name: 'Groq',
    description: 'Very fast open-weight models (Llama, Qwen…) over an OpenAI-compatible API.',
    capabilities: ['generate'],
    requiresApiKey: true,
    supportsBaseUrl: false,
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    supportsModel: true,
    defaultModel: 'llama-3.3-70b-versatile',
    supportsRegion: false,
    selfHosted: false,
    freeTier: 'Free tier with rate limits per model (requests and tokens per minute/day).',
    docsUrl: 'https://console.groq.com/docs/rate-limits',
    envKey: 'GROQ_API_KEY',
  },
  {
    id: 'openrouter',
    kind: 'llm',
    name: 'OpenRouter',
    description: 'One key for many models, including free ":free" variants.',
    capabilities: ['generate'],
    requiresApiKey: true,
    supportsBaseUrl: false,
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    supportsModel: true,
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    supportsRegion: false,
    selfHosted: false,
    freeTier: 'Free models are rate-limited per minute and per day.',
    docsUrl: 'https://openrouter.ai/docs/api-reference/limits',
    envKey: 'OPENROUTER_API_KEY',
  },
  {
    id: 'openai',
    kind: 'llm',
    name: 'OpenAI',
    description: 'OpenAI models via the official API. Paid usage.',
    capabilities: ['generate'],
    requiresApiKey: true,
    supportsBaseUrl: false,
    defaultBaseUrl: 'https://api.openai.com/v1',
    supportsModel: true,
    defaultModel: 'gpt-4o-mini',
    supportsRegion: false,
    selfHosted: false,
    freeTier: 'No free tier — pay per token.',
    docsUrl: 'https://platform.openai.com/docs/pricing',
    envKey: 'OPENAI_API_KEY',
  },
  {
    id: 'ollama',
    kind: 'llm',
    name: 'Ollama (local)',
    description: 'Run open models on your own machine. Fully private and free.',
    capabilities: ['generate'],
    requiresApiKey: false,
    supportsBaseUrl: true,
    defaultBaseUrl: 'http://localhost:11434/v1',
    supportsModel: true,
    defaultModel: 'llama3.2',
    supportsRegion: false,
    selfHosted: true,
    freeTier: 'Unlimited — runs on your hardware.',
    docsUrl: 'https://github.com/ollama/ollama',
  },
  {
    id: 'openai-compatible',
    kind: 'llm',
    name: 'Custom (OpenAI-compatible)',
    description: 'Any server exposing /v1/chat/completions — LM Studio, vLLM, LocalAI, Together, etc.',
    capabilities: ['generate'],
    requiresApiKey: false,
    supportsBaseUrl: true,
    defaultBaseUrl: 'http://localhost:1234/v1',
    supportsModel: true,
    defaultModel: 'local-model',
    supportsRegion: false,
    selfHosted: true,
    freeTier: 'Depends on the server you point it at.',
    docsUrl: '',
  },
] as const;

const DESCRIPTORS = new Map<ProviderId, ProviderDescriptor>(PROVIDERS.map((p) => [p.id, p]));

export function getProviderDescriptor(id: ProviderId): ProviderDescriptor {
  const d = DESCRIPTORS.get(id);
  if (!d) throw new Error(`Unknown provider: ${id}`);
  return d;
}

export function isProviderId(value: string): value is ProviderId {
  return DESCRIPTORS.has(value as ProviderId);
}
