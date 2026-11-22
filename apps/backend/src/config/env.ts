import { EMAIL_MAX_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@verba/shared';
import { z } from 'zod';
import { parseEncryptionKey } from '../utils/crypto';

/** Same shape rule the sign-up form uses. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Provider secrets and endpoints read from the environment (see .env.example). */
const PROVIDER_ENV_KEYS = [
  'GEMINI_API_KEY',
  'GROQ_API_KEY',
  'OPENROUTER_API_KEY',
  'OPENAI_API_KEY',
  'AZURE_TRANSLATOR_KEY',
  'AZURE_TRANSLATOR_REGION',
  'GOOGLE_TRANSLATE_API_KEY',
  'DEEPL_API_KEY',
  'LIBRETRANSLATE_API_KEY',
  'LIBRETRANSLATE_URL',
  'MYMEMORY_EMAIL',
  'OLLAMA_BASE_URL',
] as const;

export interface AppConfig {
  port: number;
  host: string;
  nodeEnv: string;
  corsOrigins: string[];
  allowExtensionOrigins: boolean;
  /** When set, only these chrome-extension IDs may call the API. */
  extensionIds: string[] | null;
  accessToken: string | undefined;
  encryptionKey: string | undefined;
  dataDir: string;
  storage: 'file' | 'supabase';
  supabaseUrl: string | undefined;
  supabaseServiceRoleKey: string | undefined;
  requestTimeoutMs: number;
  rateLimitAiPerMinute: number;
  rateLimitPerMinute: number;
  /** Per client IP, for POST /auth/login, /auth/signup and /auth/google (15-minute window). */
  rateLimitAuthPer15Min: number;
  trustProxy: boolean;
  /** Free prompts per day for a visitor who is not signed in (per install). 0 turns guest use off. */
  guestDailyLimit: number;
  /** Cap per client IP across all guests, so reinstalling the extension does not give endless free prompts. */
  guestIpDailyLimit: number;
  /** Cap on all guest prompts together per day (a cost ceiling). 0 means no global cap. */
  guestGlobalDailyLimit: number;
  /** OAuth Web client id for Google sign-in. null disables the button and POST /auth/google. */
  googleClientId: string | null;
  /** Admin account seeded on boot. Both null when not configured. */
  adminEmail: string | null;
  adminPassword: string | null;
  providerEnv: Readonly<Record<string, string | undefined>>;
}

const flag = (fallback: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(fallback)
    .transform((value) => value === 'true');

const envSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(8787),
    HOST: z.string().default('0.0.0.0'),
    NODE_ENV: z.string().default('development'),
    CORS_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
    ALLOW_EXTENSION_ORIGINS: flag('true'),
    EXTENSION_IDS: z.string().optional(),
    VERBA_ACCESS_TOKEN: z.string().min(16, 'VERBA_ACCESS_TOKEN must be at least 16 characters.').optional(),
    VERBA_ENCRYPTION_KEY: z.string().optional().superRefine((value, ctx) => {
      if (value === undefined) return;
      try {
        parseEncryptionKey(value);
      } catch (err) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: err instanceof Error ? err.message : 'Invalid key.' });
      }
    }),
    DATA_DIR: z.string().default('./data'),
    STORAGE: z.enum(['file', 'supabase']).default('file'),
    SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL.').optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(30000),
    RATE_LIMIT_AI_PER_MINUTE: z.coerce.number().int().min(1).max(100000).default(30),
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(100000).default(300),
    AUTH_RATE_LIMIT_PER_15_MIN: z.coerce.number().int().min(1).max(100000).default(20),
    TRUST_PROXY: flag('false'),
    GUEST_DAILY_LIMIT: z.coerce.number().int().min(0).max(1000).default(5),
    GUEST_IP_DAILY_LIMIT: z.coerce.number().int().min(0).max(100000).default(25),
    GUEST_GLOBAL_DAILY_LIMIT: z.coerce.number().int().min(0).max(10000000).default(1000),
    GOOGLE_CLIENT_ID: z.string().optional(),
    ADMIN_EMAIL: z
      .string()
      .trim()
      .toLowerCase()
      .max(EMAIL_MAX_LENGTH, 'ADMIN_EMAIL is too long.')
      .regex(EMAIL_PATTERN, 'ADMIN_EMAIL must be an email address.')
      .optional(),
    ADMIN_PASSWORD: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `ADMIN_PASSWORD must be at least ${PASSWORD_MIN_LENGTH} characters.`)
      .max(PASSWORD_MAX_LENGTH, `ADMIN_PASSWORD must be at most ${PASSWORD_MAX_LENGTH} characters.`)
      .optional(),
    LIBRETRANSLATE_URL: z.string().url('LIBRETRANSLATE_URL must be a valid URL.').optional(),
    OLLAMA_BASE_URL: z.string().url('OLLAMA_BASE_URL must be a valid URL.').optional(),
  })
  .superRefine((env, ctx) => {
    if (env.ADMIN_PASSWORD && !env.ADMIN_EMAIL) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ADMIN_EMAIL'], message: 'Required when ADMIN_PASSWORD is set.' });
    }
    if (env.STORAGE !== 'supabase') return;
    if (!env.SUPABASE_URL) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['SUPABASE_URL'], message: 'Required when STORAGE=supabase.' });
    }
    if (!env.SUPABASE_SERVICE_ROLE_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SUPABASE_SERVICE_ROLE_KEY'],
        message: 'Required when STORAGE=supabase.',
      });
    }
  });

/** Drops empty values so defaults apply, and trims the rest. */
function cleanEnv(env: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    const trimmed = value?.trim();
    if (trimmed) cleaned[key] = trimmed;
  }
  return cleaned;
}

const splitList = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim().replace(/\/+$/, ''))
    .filter((item) => item.length > 0);

/** Parses and validates configuration. Throws with a readable list of problems. */
export function loadConfig(env: Readonly<Record<string, string | undefined>>): AppConfig {
  const cleaned = cleanEnv(env);
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `  - ${issue.path.join('.') || 'env'}: ${issue.message}`);
    throw new Error(`Invalid configuration:\n${details.join('\n')}`);
  }
  const data = parsed.data;
  const providerEnv: Record<string, string | undefined> = {};
  for (const key of PROVIDER_ENV_KEYS) providerEnv[key] = cleaned[key];

  return {
    port: data.PORT,
    host: data.HOST,
    nodeEnv: data.NODE_ENV,
    corsOrigins: splitList(data.CORS_ORIGINS),
    allowExtensionOrigins: data.ALLOW_EXTENSION_ORIGINS,
    extensionIds: data.EXTENSION_IDS ? splitList(data.EXTENSION_IDS) : null,
    accessToken: data.VERBA_ACCESS_TOKEN,
    encryptionKey: data.VERBA_ENCRYPTION_KEY,
    dataDir: data.DATA_DIR,
    storage: data.STORAGE,
    supabaseUrl: data.SUPABASE_URL,
    supabaseServiceRoleKey: data.SUPABASE_SERVICE_ROLE_KEY,
    requestTimeoutMs: data.REQUEST_TIMEOUT_MS,
    rateLimitAiPerMinute: data.RATE_LIMIT_AI_PER_MINUTE,
    rateLimitPerMinute: data.RATE_LIMIT_PER_MINUTE,
    rateLimitAuthPer15Min: data.AUTH_RATE_LIMIT_PER_15_MIN,
    trustProxy: data.TRUST_PROXY,
    guestDailyLimit: data.GUEST_DAILY_LIMIT,
    guestIpDailyLimit: data.GUEST_IP_DAILY_LIMIT,
    guestGlobalDailyLimit: data.GUEST_GLOBAL_DAILY_LIMIT,
    googleClientId: data.GOOGLE_CLIENT_ID ?? null,
    adminEmail: data.ADMIN_EMAIL ?? null,
    adminPassword: data.ADMIN_PASSWORD ?? null,
    providerEnv,
  };
}
