import { AUTO_LANGUAGE, getLanguage, LANGUAGES, languageName, type Language } from '@verba/shared';
import { Check, ChevronDown, Search, Sparkles, Star } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { cn } from '@/utils/cn';

export interface LanguageSelectProps {
  value: string;
  onChange: (code: string) => void;
  /** Offer "Detect language" as the first option. */
  allowAuto?: boolean;
  favorites?: string[];
  /** Shown next to "Detect language" when a language was detected. */
  detected?: string | null;
  label: string;
  className?: string;
}

/** Searchable language picker with favourites pinned to the top. Keyboard: ↑ ↓ Enter Esc. */
export function LanguageSelect({ value, onChange, allowAuto, favorites = [], detected, label, className }: LanguageSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (l: Language) =>
      !q || l.name.toLowerCase().includes(q) || l.nativeName.toLowerCase().includes(q) || l.code.toLowerCase() === q;
    const favs = favorites.map((c) => getLanguage(c)).filter((l): l is Language => !!l && match(l));
    const rest = LANGUAGES.filter((l) => match(l) && !favs.some((f) => f.code === l.code));
    const auto = allowAuto && (!q || 'detect auto'.includes(q)) ? [{ code: AUTO_LANGUAGE, name: 'Detect language', nativeName: '' }] : [];
    return { flat: [...auto, ...favs, ...rest], favCount: favs.length, autoCount: auto.length };
  }, [query, favorites, allowAuto]);

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, options.flat.findIndex((o) => o.code === value)));
    inputRef.current?.focus();
    const onDown = (e: MouseEvent) => !rootRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on open
  }, [open]);

  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, listId]);

  const choose = (code: string) => {
    onChange(code);
    setOpen(false);
    setQuery('');
  };

  const display =
    value === AUTO_LANGUAGE
      ? detected
        ? `Detected: ${languageName(detected)}`
        : 'Detect language'
      : languageName(value);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 w-full items-center gap-2 rounded-[10px] px-3 text-sm font-medium text-fg transition-colors hover:bg-surface-2"
      >
        {value === AUTO_LANGUAGE && <Sparkles size={14} className="text-brand" aria-hidden />}
        <span className="truncate">{display}</span>
        <ChevronDown size={15} className={cn('ml-auto shrink-0 text-subtle transition-transform', open && 'rotate-180')} aria-hidden />
      </button>

      {open && (
        <div className="absolute left-0 z-40 mt-1.5 w-72 overflow-hidden rounded-xl border border-border bg-surface shadow-pop animate-scale-in">
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search size={14} className="text-subtle" aria-hidden />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, options.flat.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  const o = options.flat[active];
                  if (o) choose(o.code);
                } else if (e.key === 'Escape') {
                  setOpen(false);
                }
              }}
              placeholder="Search languages"
              role="combobox"
              aria-controls={listId}
              aria-expanded
              aria-activedescendant={`${listId}-${active}`}
              className="h-10 w-full bg-transparent text-sm text-fg placeholder:text-subtle focus:outline-none"
            />
          </div>
          <ul id={listId} role="listbox" aria-label={label} className="max-h-72 overflow-y-auto p-1">
            {options.flat.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-muted">No languages found</li>}
            {options.flat.map((o, i) => {
              const isFav = i >= options.autoCount && i < options.autoCount + options.favCount;
              const showRestHeader = options.favCount > 0 && i === options.autoCount + options.favCount;
              return (
                <li key={o.code} role="presentation">
                  {i === options.autoCount && options.favCount > 0 && <GroupLabel>Favourites</GroupLabel>}
                  {showRestHeader && <GroupLabel>All languages</GroupLabel>}
                  <div
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={o.code === value}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(o.code)}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm',
                      i === active ? 'bg-surface-2 text-fg' : 'text-fg/90',
                    )}
                  >
                    {o.code === AUTO_LANGUAGE ? (
                      <Sparkles size={14} className="text-brand" aria-hidden />
                    ) : isFav ? (
                      <Star size={14} className="fill-warning text-warning" aria-hidden />
                    ) : (
                      <span className="w-3.5" />
                    )}
                    <span className="flex-1 truncate">{o.name}</span>
                    {o.nativeName && o.nativeName !== o.name && <span className="truncate text-[12.5px] text-subtle">{o.nativeName}</span>}
                    {o.code === value && <Check size={14} className="text-brand" aria-hidden />}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function GroupLabel({ children }: { children: string }) {
  return <div className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">{children}</div>;
}
