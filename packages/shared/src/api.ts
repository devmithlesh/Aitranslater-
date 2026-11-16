/**
 * REST contract between the backend, the dashboard and the extension.
 * Every route lives under `/api`. All routes except `GET /api/health`
 * require `Authorization: Bearer <access token>`.
 *
 * Clients identify themselves with the `X-Verba-Client: web | extension`
 * header so history and stats can attribute activity.
 *
 * Errors always use the `ApiErrorBody` shape with a matching HTTP status.
 */
import type {
  ActivityType,
  AssistantToolId,
  ExplainLanguage,
  ReplyLength,
  ReplyStyle,
  RewriteStyle,
  SummaryFormat,
  ToolbarAction,
  TranslationTone,
} from './catalog';
import type { ProviderCapability, ProviderId, ProviderKind } from './providers';

export const CLIENT_HEADER = 'X-Verba-Client';
export type ClientKind = 'web' | 'extension';

// ── Errors ──────────────────────────────────────────────────────────
export type ApiErrorCode =
  | 'VALIDATION_ERROR' // 400
  | 'UNAUTHORIZED' // 401
  | 'FORBIDDEN' // 403 — signed in, but this route is admin-only, or the account is disabled
  | 'NOT_FOUND' // 404
  | 'CONFLICT' // 409 — e.g. an account with that email already exists
  | 'PAYLOAD_TOO_LARGE' // 413
  | 'RATE_LIMITED' // 429
  | 'CREDIT_LIMIT_REACHED' // 429 — the user's daily translation credits are used up
  | 'NO_PROVIDER_CONFIGURED' // 503 — nothing enabled/configured for this capability
  | 'PROVIDER_ERROR' // 502 — every provider in the chain failed
  | 'PROVIDER_TIMEOUT' // 504
  | 'INTERNAL'; // 500

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    /** Validation issues, or per-provider failures for PROVIDER_ERROR. */
    details?: unknown;
  };
}

/** Shared by all AI responses: which provider actually served the request. */
export interface ProviderMeta {
  provider: ProviderId;
  model?: string;
  latencyMs: number;
  /** Present when the result was saved to history. */
  historyId?: string;
}

// ── Health / auth ───────────────────────────────────────────────────
/** GET /api/health (public) */
export interface HealthResponse {
  status: 'ok';
  name: 'verba';
  version: string;
  storage: 'file' | 'supabase';
  time: string;
}

/** GET /api/auth/verify */
export interface VerifyResponse {
  ok: true;
  userId: string;
  role: UserRole;
  name: string;
}

// ── Accounts, roles and credits ─────────────────────────────────────
/**
 * Accounts sign up / log in with email + password and receive an opaque session token (Bearer),
 * valid SESSION_DAYS days, stored server-side only as a SHA-256 hash (revocable; not a JWT).
 * Account roles: "admin" (seeded from ADMIN_EMAIL + ADMIN_PASSWORD env on boot) or "user".
 * The server's own VERBA_ACCESS_TOKEN still works as an emergency/self-host admin (userId "local").
 *
 * Public (no token): GET /health, GET /auth/config, POST /auth/signup, POST /auth/login, POST /auth/google.
 * Role "user" may only call: GET /auth/verify, GET /me, POST /auth/logout, POST /auth/change-password,
 * POST /auth/sessions, POST /translate-variants, GET /settings, PUT /settings (their own), GET /assistants,
 * POST /extension/heartbeat. Anything else returns 403 FORBIDDEN. Admins may call everything.
 */
export type UserRole = 'admin' | 'user';

/**
 * "free" = daily credit limit applies (override ?? default). "unlimited" = no limit (future paid plan;
 * in v1 the admin can grant it on the Users page). The token admin and role "admin" are always unlimited.
 */
export type UserPlan = 'free' | 'unlimited';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 200;
export const NAME_MAX_LENGTH = 60;
export const EMAIL_MAX_LENGTH = 254;
export const SESSION_DAYS = 30;

/** GET /api/auth/config (public) — what the login/signup pages may offer. */
export interface AuthConfigResponse {
  signupsEnabled: boolean;
  /** OAuth Web client ID for the "Sign in with Google" button; null when GOOGLE_CLIENT_ID is not configured (hide the button). */
  googleClientId: string | null;
}

/**
 * POST /api/auth/google (public) — `idToken` is the credential from Google Identity Services.
 * The server verifies its RS256 signature against Google's JWKS, iss, aud (= GOOGLE_CLIENT_ID), exp and
 * email_verified. An existing account with the same email is linked; otherwise a new "free" account is
 * created (403 FORBIDDEN when signups are off). Disabled account → 403. Bad token → 401.
 */
export interface GoogleLoginRequest {
  idToken: string;
}

/**
 * POST /api/auth/sessions (any signed-in account) — mints an ADDITIONAL session, e.g. for the Chrome
 * extension of a Google-signed-in user. The dashboard shows it as encodeConnectionCode(apiUrl, token).
 */
export interface NewSessionResponse {
  token: string;
  expiresAt: string;
}

/** POST /api/auth/signup (public). 403 FORBIDDEN when signups are off; 409 CONFLICT when the email is taken. */
export interface SignupRequest {
  /** 1..NAME_MAX_LENGTH after trim. */
  name: string;
  /** Trimmed and lower-cased by the server; must look like an email; at most EMAIL_MAX_LENGTH. */
  email: string;
  /** PASSWORD_MIN_LENGTH..PASSWORD_MAX_LENGTH characters. */
  password: string;
}

/**
 * POST /api/auth/login (public). Wrong email or password → 401 UNAUTHORIZED "Wrong email or password."
 * (same message for both, so emails cannot be probed). Disabled account → 403 FORBIDDEN.
 */
export interface LoginRequest {
  email: string;
  password: string;
}

/** Response of signup and login. `token` is the Bearer token for every later request. */
export interface AuthSessionResponse {
  token: string;
  /** ISO timestamp when the session stops working. */
  expiresAt: string;
  me: MeResponse;
}

/**
 * POST /api/auth/change-password → 204. Wrong currentPassword → 400 VALIDATION_ERROR.
 * currentPassword is ignored (may be omitted) when the account has no password yet (Google-only),
 * which lets a Google user add a password. Clears mustChangePassword and signs out every OTHER session.
 * POST /api/auth/logout → 204, ends the current session.
 */
export interface ChangePasswordRequest {
  currentPassword?: string;
  newPassword: string;
}

/**
 * Daily credits. 1 credit = 1 successful POST /translate-variants (all tones in one call).
 * A day is the server's local calendar day; credits reset at the server's local midnight.
 */
export interface CreditStatus {
  /** null = unlimited (the admin, or no limit configured). */
  limit: number | null;
  used: number;
  /** null when unlimited. Never negative. */
  remaining: number | null;
  /** ISO timestamp of the next reset (next local midnight on the server). */
  resetsAt: string;
}

/** GET /api/me — the caller's own profile and credits (admin and users). */
export interface MeResponse {
  userId: string;
  name: string;
  /** null for the token admin ("local"), which has no account. */
  email: string | null;
  role: UserRole;
  plan: UserPlan;
  /** True after an admin reset: clients must make the user choose a new password before anything else. */
  mustChangePassword: boolean;
  /** Which sign-in methods the account has. */
  hasPassword: boolean;
  hasGoogle: boolean;
  credits: CreditStatus;
}

/** Admin view of one account. Passwords and their hashes are never returned. */
export interface UserView {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  plan: UserPlan;
  mustChangePassword: boolean;
  hasPassword: boolean;
  hasGoogle: boolean;
  disabled: boolean;
  /** Per-user override; null = this user follows AdminConfig.defaultDailyLimit. */
  dailyLimit: number | null;
  /** The limit actually enforced: null when role admin or plan unlimited, else dailyLimit ?? defaultDailyLimit (null = unlimited). */
  effectiveLimit: number | null;
  usedToday: number;
  usedThisMonth: number;
  totalUsed: number;
  lastUsedAt: string | null;
  createdAt: string;
}

/** GET /api/admin/users — newest first. */
export interface UserListResponse {
  items: UserView[];
}

/** POST /api/admin/users — the admin creates an account for someone; 409 CONFLICT when the email is taken. */
export interface CreateUserRequest {
  /** 1..NAME_MAX_LENGTH chars after trim. */
  name: string;
  email: string;
  /** Omitted or null = follow the default limit. 0..100000. */
  dailyLimit?: number | null;
}

/** PATCH /api/admin/users/:id */
export interface UpdateUserRequest {
  name?: string;
  disabled?: boolean;
  plan?: UserPlan;
  /** null = follow the default limit. 0..100000. */
  dailyLimit?: number | null;
}

/**
 * Response of POST /api/admin/users and POST /api/admin/users/:id/reset-password. `temporaryPassword` is
 * shown ONCE for the admin to send; the account gets mustChangePassword = true, and a reset signs out all
 * of that account's sessions. DELETE /api/admin/users/:id returns 204 and removes the account and its data.
 * The admin cannot disable, reset, or delete their own account through these routes (400).
 */
export interface UserPasswordResponse {
  user: UserView;
  temporaryPassword: string;
}

/** GET /api/admin/config, PUT /api/admin/config (partial update, returns the full config). */
export interface AdminConfig {
  /** Whether POST /auth/signup accepts new accounts. Default true. */
  signupsEnabled: boolean;
  /** Daily credits for every user without an override. null = unlimited. 0..100000. */
  defaultDailyLimit: number | null;
  /**
   * Daily request quota the admin enters per provider key (e.g. the Gemini free-tier limit), used only to
   * draw "412 / 1000 today" on the API usage page. Providers do not report their remaining quota.
   */
  providerDailyQuotas: Partial<Record<ProviderId, number>>;
}
export type AdminConfigUpdate = Partial<AdminConfig>;

export interface DailyPoint {
  /** "YYYY-MM-DD", server local calendar. */
  day: string;
  value: number;
}

/** One shared provider key, as seen on the API usage page. */
export interface ProviderUsageReport {
  id: ProviderId;
  name: string;
  kind: ProviderKind;
  model: string | null;
  ready: boolean;
  usage: ProviderUsage;
  /** null when the admin set no quota for this provider. */
  dailyQuota: number | null;
  /** Last 14 days, oldest first, zero-filled. */
  dailyRequests: DailyPoint[];
  dailyTokens: DailyPoint[];
}

/** GET /api/admin/usage — usage of the shared provider keys plus translations across all accounts. */
export interface AdminUsageResponse {
  /** Only providers that are ready or were used in the last 14 days. */
  providers: ProviderUsageReport[];
  translations: {
    today: number;
    thisMonth: number;
    /** Last 14 days, oldest first, zero-filled, all accounts including the admin. */
    daily: DailyPoint[];
  };
  totalUsers: number;
  /** Accounts (admin included) with at least one translation today. */
  activeUsersToday: number;
}

// ── Translation ─────────────────────────────────────────────────────
/** POST /api/translate */
export interface TranslateRequest {
  text: string;
  /** Language code or "auto". */
  sourceLang: string;
  targetLang: string;
  tone?: TranslationTone;
  /**
   * Restyle the translation (e.g. "funny", "professional"). Translates from the
   * ORIGINAL text in that style, so meaning is preserved. Requires an LLM
   * provider — the backend routes styled requests through the `llm` translator.
   */
  style?: RewriteStyle;
  /** Force one provider instead of the configured fallback chain. */
  provider?: ProviderId;
}
export interface TranslateResponse extends ProviderMeta {
  translatedText: string;
  style?: RewriteStyle;
  /** Set when sourceLang was "auto" and the provider reported a language. */
  detectedSourceLang?: string;
}

/**
 * POST /api/translate-variants
 * One LLM call: understands the input (including romanized text such as Hinglish)
 * and returns the translation in several styles at once. Requires the `llm` provider.
 */
export interface TranslateVariantsRequest {
  text: string;
  /** Language code or "auto". */
  sourceLang: string;
  targetLang: string;
  /** Distinct styles, 1..MAX_VARIANT_STYLES. Defaults to DEFAULT_VARIANT_STYLES. */
  styles?: RewriteStyle[];
}
export interface TranslationVariant {
  style: RewriteStyle;
  text: string;
}
export interface TranslateVariantsResponse extends ProviderMeta {
  /** One short sentence, in the target language, saying what the input means. */
  meaning: string;
  /** Same order as the requested styles; styles the model failed to return are omitted. */
  variants: TranslationVariant[];
  /** Set when sourceLang was "auto". */
  detectedSourceLang?: string;
  /** True when the input was another language written in Latin letters (e.g. Hinglish). */
  romanized?: boolean;
}

/** POST /api/detect-language */
export interface DetectLanguageRequest {
  text: string;
}
export interface DetectLanguageResponse extends Omit<ProviderMeta, 'historyId'> {
  language: string;
  /** 0..1 when the provider reports it. */
  confidence?: number;
}

// ── Grammar ─────────────────────────────────────────────────────────
export type GrammarIssueType = 'grammar' | 'spelling' | 'punctuation' | 'style' | 'clarity';

export interface GrammarIssue {
  type: GrammarIssueType;
  /** Exact substring of the ORIGINAL text that is wrong. */
  original: string;
  replacement: string;
  explanation: string;
}

/** POST /api/grammar */
export interface GrammarRequest {
  text: string;
  /** Hint; defaults to the text's own language. */
  language?: string;
}
export interface GrammarResponse extends ProviderMeta {
  corrected: string;
  issues: GrammarIssue[];
}

// ── Rewrite ─────────────────────────────────────────────────────────
/** POST /api/rewrite */
export interface RewriteRequest {
  text: string;
  style: RewriteStyle;
  /** Free-form extra instruction, e.g. "keep it under 50 words". */
  customInstructions?: string;
}
export interface RewriteResponse extends ProviderMeta {
  result: string;
}

// ── Summarize ───────────────────────────────────────────────────────
/** POST /api/summarize */
export interface SummarizeRequest {
  text: string;
  format?: SummaryFormat;
}
export interface SummarizeResponse extends ProviderMeta {
  result: string;
}

// ── Explain ─────────────────────────────────────────────────────────
/** POST /api/explain — explains selected text in plain, simple words. */
export interface ExplainRequest {
  text: string;
  /** "hinglish" or any supported language code. Defaults to DEFAULT_EXPLAIN_LANGUAGE. */
  language?: ExplainLanguage;
}
export interface ExplainResponse extends ProviderMeta {
  /** Plain text: short lines, "- " bullets, optional "**Heading**" lines. */
  result: string;
}

// ── Smart reply ─────────────────────────────────────────────────────
/** POST /api/smart-reply */
export interface SmartReplyRequest {
  /** The message / conversation being replied to. */
  context: string;
  /** Optional: what the user wants to say ("accept, propose Tuesday"). */
  intent?: string;
  style: ReplyStyle;
  length: ReplyLength;
  /** Number of alternatives, 1–3. Default 1. */
  count?: number;
}
export interface SmartReplyResponse extends ProviderMeta {
  replies: string[];
}

// ── AI assistant ────────────────────────────────────────────────────
/**
 * POST /api/ai-assistant — exactly one of `toolId` or `assistantId`.
 * `toolId: "custom"` requires `prompt`. `toolId: "translate"` uses `targetLang`
 * (falls back to the user's default target language).
 */
export interface AssistantRunRequest {
  text: string;
  toolId?: AssistantToolId;
  assistantId?: string;
  prompt?: string;
  targetLang?: string;
}
export interface AssistantRunResponse extends ProviderMeta {
  result: string;
}

// ── Custom assistants ───────────────────────────────────────────────
export interface CustomAssistant {
  id: string;
  name: string;
  description: string;
  /** lucide-react icon name. */
  icon: string;
  /** System instruction applied to the user's text. */
  instructions: string;
  /** Show in the extension's "More tools" menu. */
  showInExtension: boolean;
  createdAt: string;
  updatedAt: string;
}
export type CustomAssistantInput = Pick<CustomAssistant, 'name' | 'description' | 'icon' | 'instructions' | 'showInExtension'>;

// GET /api/assistants → { items: CustomAssistant[] }
// POST /api/assistants (CustomAssistantInput) → CustomAssistant
// PUT /api/assistants/:id (Partial<CustomAssistantInput>) → CustomAssistant
// DELETE /api/assistants/:id → 204
export interface AssistantListResponse {
  items: CustomAssistant[];
}

// ── History ─────────────────────────────────────────────────────────
export interface HistoryItem {
  id: string;
  type: ActivityType;
  input: string;
  output: string;
  meta: {
    provider: ProviderId;
    model?: string;
    sourceLang?: string;
    targetLang?: string;
    detectedLang?: string;
    tone?: TranslationTone;
    style?: RewriteStyle | ReplyStyle;
    /** True when the input looked like romanized text (e.g. Hinglish) and was transliterated. */
    romanized?: boolean;
    format?: SummaryFormat;
    toolId?: AssistantToolId;
    assistantId?: string;
    assistantName?: string;
  };
  client: ClientKind;
  favorite: boolean;
  createdAt: string;
}

/** GET /api/history?type=&q=&favorite=true&limit=30&cursor= */
export interface HistoryQuery {
  type?: ActivityType;
  q?: string;
  favorite?: boolean;
  limit?: number;
  /** Opaque cursor from a previous page. */
  cursor?: string;
}
export interface HistoryListResponse {
  items: HistoryItem[];
  nextCursor: string | null;
  total: number;
}
// PATCH /api/history/:id ({ favorite: boolean }) → HistoryItem
// DELETE /api/history/:id → 204
// DELETE /api/history → { deleted: number }   (clear all)

// ── Settings ────────────────────────────────────────────────────────
export interface ExtensionSettings {
  enabled: boolean;
  /** Show the floating toolbar automatically when text is selected. */
  showToolbarOnSelection: boolean;
  /** Only auto-show inside inputs/textareas/contenteditable (not on page text). */
  editableOnly: boolean;
  /** Hostnames where the toolbar never appears, e.g. "bank.example.com". */
  disabledSites: string[];
  /** Ordered toolbar buttons. */
  toolbarActions: ToolbarAction[];
}

export interface UserSettings {
  defaultSourceLang: string; // "auto" or code
  defaultTargetLang: string;
  favoriteLanguages: string[];
  translationTone: TranslationTone;
  defaultRewriteStyle: RewriteStyle;
  defaultReplyStyle: ReplyStyle;
  defaultReplyLength: ReplyLength;
  defaultSummaryFormat: SummaryFormat;
  saveHistory: boolean;
  /** 0 = keep forever. */
  historyRetentionDays: number;
  /** Show "text is sent to <provider>" notices in the UIs. */
  showPrivacyNotice: boolean;
  extension: ExtensionSettings;
  updatedAt: string;
}

/** Deep-partial update payload for PUT /api/settings (arrays are replaced). */
export type UserSettingsUpdate = Partial<Omit<UserSettings, 'extension' | 'updatedAt'>> & {
  extension?: Partial<ExtensionSettings>;
};

export const DEFAULT_SETTINGS: Omit<UserSettings, 'updatedAt'> = {
  defaultSourceLang: 'auto',
  defaultTargetLang: 'hi',
  favoriteLanguages: ['en', 'hi', 'pa'],
  translationTone: 'neutral',
  defaultRewriteStyle: 'professional',
  defaultReplyStyle: 'professional',
  defaultReplyLength: 'short',
  defaultSummaryFormat: 'medium',
  saveHistory: true,
  historyRetentionDays: 90,
  showPrivacyNotice: true,
  extension: {
    enabled: true,
    showToolbarOnSelection: true,
    editableOnly: false,
    disabledSites: [],
    toolbarActions: ['translate', 'grammar', 'rewrite', 'tone', 'summarize', 'reply', 'more'],
  },
};

// ── Providers ───────────────────────────────────────────────────────
/** Public (secret-free) view of a provider's configuration. */
export interface ProviderView {
  id: ProviderId;
  kind: ProviderKind;
  capabilities: ProviderCapability[];
  enabled: boolean;
  /** Lower runs first within its kind's fallback chain. */
  priority: number;
  /** A key is stored (UI) or supplied by an env var. Never the key itself. */
  hasApiKey: boolean;
  apiKeySource: 'settings' | 'env' | null;
  /** Last 4 chars only, e.g. "••••a1b2". */
  apiKeyPreview: string | null;
  baseUrl: string | null;
  model: string | null;
  region: string | null;
  /** Enabled and has everything it needs to be called. */
  ready: boolean;
  /** Human-readable reason when not ready ("API key required"). */
  notReadyReason: string | null;
  usage: ProviderUsage;
  lastError: { message: string; at: string } | null;
}

export interface ProviderUsage {
  requestsToday: number;
  charsToday: number;
  requestsThisMonth: number;
  charsThisMonth: number;
  /** AI tokens (input + output) reported by LLM providers; 0 for providers that do not report tokens. */
  tokensToday: number;
  tokensThisMonth: number;
  errorsThisMonth: number;
  avgLatencyMs: number | null;
  lastUsedAt: string | null;
}

/** GET /api/providers */
export interface ProviderListResponse {
  items: ProviderView[];
}

/** PUT /api/providers/:id → ProviderView */
export interface ProviderUpdateRequest {
  enabled?: boolean;
  priority?: number;
  /** Write-only. Send to set/replace. */
  apiKey?: string;
  /** Remove the stored key. */
  clearApiKey?: boolean;
  baseUrl?: string | null;
  model?: string | null;
  region?: string | null;
}

/** POST /api/providers/:id/test — runs a tiny real request. */
export interface ProviderTestResponse {
  ok: boolean;
  latencyMs: number;
  message: string;
  sample?: string;
}

// ── Stats / overview ────────────────────────────────────────────────
/** GET /api/stats */
export interface StatsResponse {
  totals: Record<ActivityType, number> & { all: number };
  /** Last 14 days, oldest first, "YYYY-MM-DD". */
  daily: { date: string; count: number }[];
  topTools: { type: ActivityType; count: number }[];
  topLanguages: { code: string; count: number }[];
  charsProcessed: number;
  recent: HistoryItem[];
  byClient: Record<ClientKind, number>;
}

// ── Extension link ──────────────────────────────────────────────────
/** POST /api/extension/heartbeat */
export interface ExtensionHeartbeatRequest {
  version: string;
  userAgent?: string;
}
/** GET /api/extension/status */
export interface ExtensionStatusResponse {
  connected: boolean;
  /** Seen within the last 10 minutes. */
  online: boolean;
  lastSeenAt: string | null;
  version: string | null;
}

/**
 * The "connection code" the dashboard shows and the extension accepts:
 * base64url(JSON.stringify(ConnectionCode)) prefixed with "verba_".
 */
export interface ConnectionCode {
  v: 1;
  apiUrl: string;
  token: string;
}
