import { LANGUAGES, getLanguage } from '@verba/shared';

/** Like normalizeLanguage, but returns undefined unless the result is a known language code. */
export function normalizeDetectedLanguage(code: string): string | undefined {
  const normalized = normalizeLanguage(code);
  // Hinglish is Hindi in Latin letters: report the language the text is really in.
  if (normalized === 'hinglish') return 'hi';
  return getLanguage(normalized) ? normalized : undefined;
}

/** Wraps user content so the model can tell data from instructions. */
export function wrapUserText(text: string): string {
  return `<text>\n${neutralizeTextTags(text)}\n</text>`;
}

/** Stops user text from closing or reopening the <text> wrapper by replacing "<" in such tags. */
function neutralizeTextTags(text: string): string {
  return text.replace(/<(\s*\/?\s*text\s*>)/gi, '‹$1');
}

const QUOTE_PAIRS: readonly [string, string][] = [
  ['"', '"'],
  ['“', '”'],
  ["'", "'"],
];

/** Trims model output, strips a wrapping code fence and wrapping quotes the input did not have. */
export function cleanModelOutput(raw: string, input = ''): string {
  let out = raw.trim();
  if (!input.includes('```')) {
    const fenced = /^```[\w-]*\s*\n?([\s\S]*?)\n?```$/.exec(out);
    if (fenced) out = fenced[1].trim();
  }
  const trimmedInput = input.trim();
  for (const [open, close] of QUOTE_PAIRS) {
    if (out.length >= 2 && out.startsWith(open) && out.endsWith(close) && !trimmedInput.startsWith(open)) {
      out = out.slice(open.length, out.length - close.length).trim();
      break;
    }
  }
  return out;
}

export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

/** Canonical language code ("zh" -> "zh-Hans", "Hindi" -> "hi"); unknown input is returned trimmed. */
export function normalizeLanguage(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) return '';
  const known = getLanguage(trimmed);
  if (known) return known.code;
  const byName = LANGUAGES.find((lang) => lang.name.toLowerCase() === trimmed.toLowerCase());
  return byName?.code ?? trimmed;
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
