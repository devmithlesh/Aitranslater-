/**
 * Static catalogs shared by the backend (prompt building + validation),
 * the dashboard and the extension (labels, menus). `icon` values are
 * lucide-react component names so every UI renders the same glyph.
 */
import { getLanguage, isSupportedLanguage } from './languages';

export interface CatalogEntry<Id extends string> {
  id: Id;
  label: string;
  description: string;
  icon: string;
}

// ── Translation tone ────────────────────────────────────────────────
export const TRANSLATION_TONES = ['neutral', 'formal', 'casual', 'professional'] as const;
export type TranslationTone = (typeof TRANSLATION_TONES)[number];

export const TRANSLATION_TONE_LABELS: Record<TranslationTone, string> = {
  neutral: 'Neutral',
  formal: 'Formal',
  casual: 'Casual',
  professional: 'Professional',
};

// ── Rewrite styles ──────────────────────────────────────────────────
export const REWRITE_STYLES = [
  'professional',
  'formal',
  'casual',
  'friendly',
  'polite',
  'simple',
  'academic',
  'business',
  'shorter',
  'longer',
  'natural',
  'funny',
] as const;
export type RewriteStyle = (typeof REWRITE_STYLES)[number];

/** Styles returned by POST /api/translate-variants when the request names none, in display order. */
export const DEFAULT_VARIANT_STYLES: readonly RewriteStyle[] = [
  'natural',
  'professional',
  'casual',
  'polite',
  'funny',
  'formal',
];
/** Upper bound on styles per variants request (keeps one LLM call reasonably sized). */
export const MAX_VARIANT_STYLES = 8;

export const REWRITE_STYLE_CATALOG: readonly CatalogEntry<RewriteStyle>[] = [
  { id: 'professional', label: 'Professional', description: 'Confident and polished for work.', icon: 'Briefcase' },
  { id: 'formal', label: 'Formal', description: 'Proper, respectful and precise.', icon: 'Landmark' },
  { id: 'casual', label: 'Casual', description: 'Relaxed, like talking to a friend.', icon: 'Coffee' },
  { id: 'friendly', label: 'Friendly', description: 'Warm and approachable.', icon: 'Smile' },
  { id: 'polite', label: 'Polite', description: 'Courteous and considerate.', icon: 'HeartHandshake' },
  { id: 'simple', label: 'Simple English', description: 'Plain words, short sentences.', icon: 'Baby' },
  { id: 'academic', label: 'Academic', description: 'Scholarly and well-structured.', icon: 'GraduationCap' },
  { id: 'business', label: 'Business', description: 'Clear, outcome-focused language.', icon: 'Building2' },
  { id: 'shorter', label: 'Shorter', description: 'Same meaning, fewer words.', icon: 'Minimize2' },
  { id: 'longer', label: 'Longer', description: 'Add detail and depth.', icon: 'Maximize2' },
  { id: 'natural', label: 'More natural', description: 'Sounds like a fluent native speaker.', icon: 'Leaf' },
  { id: 'funny', label: 'Funny', description: 'Playful and witty, same message.', icon: 'Laugh' },
];

// ── Smart reply ─────────────────────────────────────────────────────
export const REPLY_STYLES = ['positive', 'neutral', 'professional', 'friendly', 'decline'] as const;
export type ReplyStyle = (typeof REPLY_STYLES)[number];

export const REPLY_LENGTHS = ['short', 'detailed'] as const;
export type ReplyLength = (typeof REPLY_LENGTHS)[number];

// ── Summaries ───────────────────────────────────────────────────────
export const SUMMARY_FORMATS = ['short', 'medium', 'bullets'] as const;
export type SummaryFormat = (typeof SUMMARY_FORMATS)[number];

// ── Explain (selected text explained simply) ───────────────────────
/** "Hindi written in Latin letters, mixed with English": a special explain language with no ISO code. */
export const HINGLISH = 'hinglish';

/**
 * Output language for POST /api/explain: HINGLISH or any code from LANGUAGES ("en", "ta", "fr", "zh-Hans"...).
 * Validate with isExplainLanguage.
 */
export type ExplainLanguage = string;

export const DEFAULT_EXPLAIN_LANGUAGE: ExplainLanguage = HINGLISH;

/** Quick picks shown first in UIs; every other supported language is also allowed. */
export const EXPLAIN_QUICK_LANGUAGES: readonly ExplainLanguage[] = [HINGLISH, 'en', 'hi'];

export function isExplainLanguage(value: unknown): value is ExplainLanguage {
  return typeof value === 'string' && (value === HINGLISH || isSupportedLanguage(value));
}

/** Display name: "Hinglish", or the language's own name ("हिन्दी", "Français"). */
export function explainLanguageLabel(code: ExplainLanguage): string {
  if (code === HINGLISH) return 'Hinglish';
  return getLanguage(code)?.nativeName ?? code;
}

// ── Extension toolbar actions ───────────────────────────────────────
export const TOOLBAR_ACTIONS = ['translate', 'grammar', 'rewrite', 'tone', 'summarize', 'reply', 'more'] as const;
export type ToolbarAction = (typeof TOOLBAR_ACTIONS)[number];

export const TOOLBAR_ACTION_CATALOG: readonly CatalogEntry<ToolbarAction>[] = [
  { id: 'translate', label: 'Translate', description: 'Translate the selection.', icon: 'Languages' },
  { id: 'grammar', label: 'Fix grammar', description: 'Correct grammar and spelling.', icon: 'SpellCheck' },
  { id: 'rewrite', label: 'Rewrite', description: 'Rewrite in your default style.', icon: 'PenLine' },
  { id: 'tone', label: 'Change tone', description: 'Pick a tone or style.', icon: 'Palette' },
  { id: 'summarize', label: 'Summarize', description: 'Summarize the selection.', icon: 'AlignLeft' },
  { id: 'reply', label: 'Smart reply', description: 'Draft a reply to this message.', icon: 'Reply' },
  { id: 'more', label: 'More tools', description: 'All AI tools and custom assistants.', icon: 'MoreHorizontal' },
];

/** Activity types counted in usage stats. */
export const ACTIVITY_TYPES = ['translate', 'grammar', 'rewrite', 'summarize', 'smart-reply', 'assistant'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** Hard input limit (characters) enforced by the backend and pre-checked by clients. */
export const MAX_INPUT_CHARS = 12_000;
