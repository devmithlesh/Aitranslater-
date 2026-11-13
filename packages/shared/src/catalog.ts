/**
 * Static catalogs shared by the backend (prompt building + validation),
 * the dashboard and the extension (labels, menus). `icon` values are
 * lucide-react component names so every UI renders the same glyph.
 */

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

/** Quick restyle chips shown on a translation result (popup + dashboard). */
export const TRANSLATION_STYLE_CHIPS: readonly RewriteStyle[] = [
  'natural',
  'professional',
  'casual',
  'friendly',
  'funny',
  'formal',
  'polite',
  'shorter',
];

// ── Smart reply ─────────────────────────────────────────────────────
export const REPLY_STYLES = ['positive', 'neutral', 'professional', 'friendly', 'decline'] as const;
export type ReplyStyle = (typeof REPLY_STYLES)[number];

export const REPLY_STYLE_LABELS: Record<ReplyStyle, string> = {
  positive: 'Positive',
  neutral: 'Neutral',
  professional: 'Professional',
  friendly: 'Friendly',
  decline: 'Politely decline',
};

export const REPLY_LENGTHS = ['short', 'detailed'] as const;
export type ReplyLength = (typeof REPLY_LENGTHS)[number];

// ── Summaries ───────────────────────────────────────────────────────
export const SUMMARY_FORMATS = ['short', 'medium', 'bullets'] as const;
export type SummaryFormat = (typeof SUMMARY_FORMATS)[number];

export const SUMMARY_FORMAT_LABELS: Record<SummaryFormat, string> = {
  short: 'One-liner',
  medium: 'Paragraph',
  bullets: 'Key points',
};

// ── Built-in AI assistant tools ─────────────────────────────────────
export const ASSISTANT_TOOLS = [
  'summarize',
  'expand',
  'improve',
  'explain',
  'simplify',
  'fix-grammar',
  'generate-email',
  'social-caption',
  'translate',
  'custom',
] as const;
export type AssistantToolId = (typeof ASSISTANT_TOOLS)[number];

export const ASSISTANT_TOOL_CATALOG: readonly CatalogEntry<AssistantToolId>[] = [
  { id: 'summarize', label: 'Summarize', description: 'Condense text into the key ideas.', icon: 'AlignLeft' },
  { id: 'expand', label: 'Expand', description: 'Develop a short note into fuller text.', icon: 'Expand' },
  { id: 'improve', label: 'Improve writing', description: 'Sharpen clarity, flow and word choice.', icon: 'Sparkles' },
  { id: 'explain', label: 'Explain', description: 'Explain what the text means in plain terms.', icon: 'Lightbulb' },
  { id: 'simplify', label: 'Make simpler', description: 'Rewrite for an easy reading level.', icon: 'Feather' },
  { id: 'fix-grammar', label: 'Fix grammar', description: 'Correct grammar, spelling and punctuation.', icon: 'SpellCheck' },
  { id: 'generate-email', label: 'Generate email', description: 'Turn notes into a ready-to-send email.', icon: 'Mail' },
  { id: 'social-caption', label: 'Social caption', description: 'Write a catchy caption with hashtags.', icon: 'Hash' },
  { id: 'translate', label: 'Translate', description: 'Translate into your target language.', icon: 'Languages' },
  { id: 'custom', label: 'Custom prompt', description: 'Run your own instruction on the text.', icon: 'Wand2' },
];

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

/** Activity types recorded in history / stats. */
export const ACTIVITY_TYPES = ['translate', 'grammar', 'rewrite', 'summarize', 'smart-reply', 'assistant'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  translate: 'Translation',
  grammar: 'Grammar check',
  rewrite: 'Rewrite',
  summarize: 'Summary',
  'smart-reply': 'Smart reply',
  assistant: 'AI assistant',
};

/** Hard input limit (characters) enforced by the backend and pre-checked by clients. */
export const MAX_INPUT_CHARS = 12_000;
