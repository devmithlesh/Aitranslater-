export interface Language {
  /** ISO 639-1 code (BCP-47 where a region/script matters, e.g. zh-Hans). */
  code: string;
  name: string;
  nativeName: string;
  rtl?: boolean;
}

/** Sentinel used for "detect the source language automatically". */
export const AUTO_LANGUAGE = 'auto';

export const LANGUAGES: readonly Language[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  // Hindi in Latin letters mixed with English ("kya haal hai"). No ISO code: only the AI model handles it.
  { code: 'hinglish', name: 'Hinglish', nativeName: 'Hinglish' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', rtl: true },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska' },
  { code: 'da', name: 'Danish', nativeName: 'Dansk' },
  { code: 'nb', name: 'Norwegian', nativeName: 'Norsk bokmål' },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski' },
  { code: 'cs', name: 'Czech', nativeName: 'Čeština' },
  { code: 'ro', name: 'Romanian', nativeName: 'Română' },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar' },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', rtl: true },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית', rtl: true },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی', rtl: true },
  { code: 'zh-Hans', name: 'Chinese (Simplified)', nativeName: '简体中文' },
  { code: 'zh-Hant', name: 'Chinese (Traditional)', nativeName: '繁體中文' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu' },
  { code: 'fil', name: 'Filipino', nativeName: 'Filipino' },
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili' },
] as const;

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code.toLowerCase(), l]));

/** Case-insensitive lookup. Also resolves base codes ("zh" → zh-Hans, "pt-BR" → pt). */
export function getLanguage(code: string | null | undefined): Language | undefined {
  if (!code) return undefined;
  const key = code.toLowerCase();
  const exact = BY_CODE.get(key);
  if (exact) return exact;
  if (key === 'zh' || key === 'zh-cn') return BY_CODE.get('zh-hans');
  if (key === 'zh-tw' || key === 'zh-hk') return BY_CODE.get('zh-hant');
  if (key === 'no') return BY_CODE.get('nb');
  if (key === 'tl') return BY_CODE.get('fil');
  if (key === 'iw') return BY_CODE.get('he');
  return BY_CODE.get(key.split(/[-_]/)[0] ?? '');
}

export function languageName(code: string | null | undefined): string {
  if (code === AUTO_LANGUAGE) return 'Detect language';
  return getLanguage(code)?.name ?? (code ? code.toUpperCase() : 'Unknown');
}

export function isSupportedLanguage(code: string): boolean {
  return getLanguage(code) !== undefined;
}
