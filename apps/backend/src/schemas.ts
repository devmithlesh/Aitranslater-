import { z } from 'zod';
import {
  ACTIVITY_TYPES,
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  ASSISTANT_TOOLS,
  AUTO_LANGUAGE,
  HINGLISH,
  isExplainLanguage,
  LLM_PROVIDER_IDS,
  MAX_INPUT_CHARS,
  MAX_VARIANT_STYLES,
  REPLY_LENGTHS,
  REPLY_STYLES,
  REWRITE_STYLES,
  SUMMARY_FORMATS,
  TOOLBAR_ACTIONS,
  TRANSLATION_PROVIDER_IDS,
  TRANSLATION_TONES,
  getLanguage,
  isSupportedLanguage,
} from '@verba/shared';
import type { ProviderId } from '@verba/shared';
import { isHttpUrl } from './utils/text';

/** Same shape rule the server applies to ADMIN_EMAIL. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Request validation for every API route. Output types match the shared contract. */

const canonicalCode = (value: string): string => getLanguage(value)?.code ?? value;

const targetLanguage = z
  .string()
  .trim()
  .refine((value) => isSupportedLanguage(value), { message: 'Unsupported target language code.' })
  .transform(canonicalCode);

const sourceLanguage = z
  .string()
  .trim()
  .refine((value) => value.toLowerCase() === AUTO_LANGUAGE || isSupportedLanguage(value), {
    message: 'Unsupported source language code.',
  })
  .transform((value) => (value.toLowerCase() === AUTO_LANGUAGE ? AUTO_LANGUAGE : canonicalCode(value)));

const textInput = (max: number = MAX_INPUT_CHARS) =>
  z
    .string()
    .trim()
    .min(1, 'Text is required.')
    .max(max, `Text must be ${max} characters or fewer.`);

const nullableText = (max: number) =>
  z.union([z.null(), z.string().trim().max(max).transform((value) => value || null)]);

const unique = <T>(items: T[]): T[] => [...new Set(items)];

const hostname = /^(?=.{1,253}$)([a-z0-9-]+\.)*[a-z0-9-]+$/;

export const translateSchema = z.object({
  text: textInput(),
  sourceLang: sourceLanguage,
  targetLang: targetLanguage,
  tone: z.enum(TRANSLATION_TONES).optional(),
  style: z.enum(REWRITE_STYLES).optional(),
  provider: z.enum(TRANSLATION_PROVIDER_IDS).optional(),
});

export const detectLanguageSchema = z.object({ text: textInput() });

export const grammarSchema = z.object({
  text: textInput(),
  language: sourceLanguage.optional(),
});

export const rewriteSchema = z.object({
  text: textInput(),
  style: z.enum(REWRITE_STYLES),
  customInstructions: z.string().trim().max(500).optional(),
});

export const summarizeSchema = z.object({
  text: textInput(),
  format: z.enum(SUMMARY_FORMATS).optional(),
});

/** "hinglish" or any supported language code; codes are canonicalized, "hinglish" is kept as-is. */
export const explainSchema = z.object({
  text: textInput(),
  language: z
    .string()
    .trim()
    .refine((value) => isExplainLanguage(value), { message: 'Unsupported explain language.' })
    .transform((value) => (value === HINGLISH ? value : canonicalCode(value)))
    .optional(),
});

export const smartReplySchema = z.object({
  context: textInput(),
  intent: z.string().trim().max(500).optional(),
  style: z.enum(REPLY_STYLES),
  length: z.enum(REPLY_LENGTHS),
  count: z.number().int().min(1).max(3).optional(),
});

export const translateVariantsSchema = z.object({
  text: textInput(),
  sourceLang: sourceLanguage,
  targetLang: targetLanguage,
  styles: z.array(z.enum(REWRITE_STYLES)).min(1).max(MAX_VARIANT_STYLES).transform(unique).optional(),
});

export const assistantRunSchema = z
  .object({
    text: textInput(),
    toolId: z.enum(ASSISTANT_TOOLS).optional(),
    assistantId: z.string().trim().min(1).max(100).optional(),
    prompt: z.string().trim().max(2000).optional(),
    targetLang: targetLanguage.optional(),
  })
  .superRefine((value, ctx) => {
    if (Boolean(value.toolId) === Boolean(value.assistantId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide exactly one of "toolId" or "assistantId".',
      });
    }
    if (value.toolId === 'custom' && !value.prompt) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['prompt'], message: 'A custom prompt is required for toolId "custom".' });
    }
  });

const assistantFields = {
  name: z.string().trim().min(1, 'Name is required.').max(60),
  description: z.string().trim().max(200).default(''),
  icon: z.string().trim().min(1).max(40).default('Sparkles'),
  instructions: z.string().trim().min(1, 'Instructions are required.').max(4000),
  showInExtension: z.boolean().default(false),
};

export const assistantInputSchema = z.object(assistantFields);
export const assistantPatchSchema = z.object(assistantFields).partial();

export const historyQuerySchema = z.object({
  type: z.enum(ACTIVITY_TYPES).optional(),
  q: z.string().trim().max(200).optional(),
  favorite: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().max(200).optional(),
});

export const historyFavoriteSchema = z.object({ favorite: z.boolean() });

const extensionUpdateSchema = z
  .object({
    enabled: z.boolean().optional(),
    showToolbarOnSelection: z.boolean().optional(),
    editableOnly: z.boolean().optional(),
    disabledSites: z
      .array(
        z
          .string()
          .trim()
          .toLowerCase()
          .regex(hostname, 'Each disabled site must be a hostname such as "bank.example.com".'),
      )
      .max(200)
      .transform(unique)
      .optional(),
    toolbarActions: z
      .array(z.enum(TOOLBAR_ACTIONS))
      .max(TOOLBAR_ACTIONS.length)
      .refine((items) => unique(items).length === items.length, 'toolbarActions must not repeat entries.')
      .optional(),
  })
  .strict();

/** `updatedAt` is accepted as a read-only echo (clients often send the whole object back) and ignored. */
export const settingsUpdateSchema = z
  .object({
    defaultSourceLang: sourceLanguage.optional(),
    defaultTargetLang: targetLanguage.optional(),
    favoriteLanguages: z.array(targetLanguage).max(12).transform(unique).optional(),
    translationTone: z.enum(TRANSLATION_TONES).optional(),
    defaultRewriteStyle: z.enum(REWRITE_STYLES).optional(),
    defaultReplyStyle: z.enum(REPLY_STYLES).optional(),
    defaultReplyLength: z.enum(REPLY_LENGTHS).optional(),
    defaultSummaryFormat: z.enum(SUMMARY_FORMATS).optional(),
    saveHistory: z.boolean().optional(),
    historyRetentionDays: z.number().int().min(0).max(3650).optional(),
    showPrivacyNotice: z.boolean().optional(),
    extension: extensionUpdateSchema.optional(),
    updatedAt: z.string().optional(),
  })
  .strict()
  .transform(({ updatedAt: _updatedAt, ...rest }) => rest);

export const providerUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  priority: z.number().int().min(0).max(99).optional(),
  apiKey: z.string().trim().max(512).optional(),
  clearApiKey: z.boolean().optional(),
  baseUrl: z
    .union([
      z.null(),
      z
        .string()
        .trim()
        .max(500)
        .refine((value) => value === '' || isHttpUrl(value), { message: 'Base URL must be an http(s) URL.' })
        .transform((value) => value || null),
    ])
    .optional(),
  model: nullableText(200).optional(),
  region: nullableText(64).optional(),
});

export const heartbeatSchema = z.object({
  version: z.string().trim().min(1).max(20),
  userAgent: z.string().max(300).optional(),
});

// ── Accounts, sessions and admin ────────────────────────────────────
const userName = z.string().trim().min(1, 'Name is required.').max(NAME_MAX_LENGTH);
/** Trimmed and lower-cased before the checks, so "  Ana@Example.com " is stored as "ana@example.com". */
const emailAddress = z
  .string()
  .trim()
  .toLowerCase()
  .max(EMAIL_MAX_LENGTH, 'Email is too long.')
  .regex(EMAIL_PATTERN, 'Enter a valid email address.');
const newPassword = z
  .string()
  .min(PASSWORD_MIN_LENGTH, 'Password must be at least ' + PASSWORD_MIN_LENGTH + ' characters.')
  .max(PASSWORD_MAX_LENGTH, 'Password must be at most ' + PASSWORD_MAX_LENGTH + ' characters.');
const dailyLimitValue = z.number().int().min(0).max(100_000);
const nullableDailyLimit = z.union([z.null(), dailyLimitValue]);
const PROVIDER_IDS = [...TRANSLATION_PROVIDER_IDS, ...LLM_PROVIDER_IDS] as [ProviderId, ...ProviderId[]];

export const signupSchema = z.object({
  name: userName,
  email: emailAddress,
  password: newPassword,
});

export const loginSchema = z.object({
  email: emailAddress,
  /** Any length: a wrong-length guess should get the same "Wrong email or password." answer. */
  password: z.string().min(1, 'Password is required.').max(PASSWORD_MAX_LENGTH),
});

export const googleLoginSchema = z.object({
  idToken: z.string().min(1, 'idToken is required.').max(8192),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().max(PASSWORD_MAX_LENGTH).optional(),
  newPassword,
});

export const createUserSchema = z.object({
  name: userName,
  email: emailAddress,
  dailyLimit: nullableDailyLimit.optional(),
});

export const updateUserSchema = z.object({
  name: userName.optional(),
  disabled: z.boolean().optional(),
  plan: z.enum(['free', 'unlimited']).optional(),
  dailyLimit: nullableDailyLimit.optional(),
});

export const adminConfigUpdateSchema = z.object({
  signupsEnabled: z.boolean().optional(),
  defaultDailyLimit: nullableDailyLimit.optional(),
  /** The object replaces the stored map. A null value removes that provider. */
  providerDailyQuotas: z
    .record(z.enum(PROVIDER_IDS), z.union([z.null(), z.number().int().min(1).max(10_000_000)]))
    .optional(),
});

export type SettingsPatch = z.infer<typeof settingsUpdateSchema>;
export type ProviderPatch = z.infer<typeof providerUpdateSchema>;
