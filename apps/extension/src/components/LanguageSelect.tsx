import { AUTO_LANGUAGE, LANGUAGES, languageName } from '@verba/shared';
import { useMemo } from 'react';
import { cn } from './ui/cn';

export interface LanguageSelectProps {
  id?: string;
  label: string;
  value: string;
  onChange: (code: string) => void;
  /** Adds a "Detect language" option (source languages only). */
  includeAuto?: boolean;
  /** Shown first in their own group, and removed from the "All languages" group. */
  favorites?: readonly string[];
  disabled?: boolean;
  className?: string;
}

/** Native select with favourites grouped first. Keeps an unknown current value selectable. */
export function LanguageSelect({
  id,
  label,
  value,
  onChange,
  includeAuto,
  favorites = [],
  disabled,
  className,
}: LanguageSelectProps) {
  const { favoriteLangs, otherLangs } = useMemo(() => {
    const known = new Set(LANGUAGES.map((l) => l.code));
    const favs = favorites.filter((code, i) => known.has(code) && favorites.indexOf(code) === i);
    const favSet = new Set(favs);
    return {
      favoriteLangs: favs.map((code) => ({ code, name: languageName(code) })),
      otherLangs: LANGUAGES.filter((l) => !favSet.has(l.code)),
    };
  }, [favorites]);

  const knownValue = value === AUTO_LANGUAGE || LANGUAGES.some((l) => l.code === value) || favorites.includes(value);

  return (
    <select
      id={id}
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'h-8 min-w-0 rounded-lg border border-border bg-surface px-2 text-[12.5px] text-fg shadow-card',
        'hover:border-border-strong focus:border-brand/50 disabled:opacity-50',
        className,
      )}
    >
      {includeAuto && <option value={AUTO_LANGUAGE}>Detect language</option>}
      {!knownValue && <option value={value}>{languageName(value)}</option>}
      {favoriteLangs.length > 0 && (
        <optgroup label="Favourites">
          {favoriteLangs.map((l) => (
            <option key={`fav-${l.code}`} value={l.code}>
              {l.name}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label="All languages">
        {otherLangs.map((l) => (
          <option key={l.code} value={l.code}>
            {l.name}
          </option>
        ))}
      </optgroup>
    </select>
  );
}
