import { getLanguage, REWRITE_STYLE_CATALOG, type TranslationVariant } from '@verba/shared';
import { useRef, type KeyboardEvent } from 'react';
import { Icon } from '../../components/ui/Icon';
import { cn } from '../../components/ui/cn';

export interface VariantTabsProps {
  /** Variants in server order. Must not be empty. */
  variants: readonly TranslationVariant[];
  /** Style id of the selected tab. Falls back to the first variant when it is not present. */
  activeStyle: string;
  onSelect: (style: string) => void;
  /** Prefix for element ids (unique per instance). */
  idPrefix: string;
  /** Language of the variant text (the target language the request used). */
  lang: string;
}

/** Horizontally scrollable tablist. One variant is shown at a time in the tabpanel. */
export function VariantTabs({ variants, activeStyle, onSelect, idPrefix, lang }: VariantTabsProps) {
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  if (variants.length === 0) return null;

  const activeIndex = Math.max(
    0,
    variants.findIndex((v) => v.style === activeStyle),
  );
  const active = variants[activeIndex];
  const rtl = getLanguage(lang)?.rtl ?? false;
  const tabId = (style: string) => `${idPrefix}-tab-${style}`;
  const panelId = `${idPrefix}-panel`;

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const count = variants.length;
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
        next = (activeIndex + 1) % count;
        break;
      case 'ArrowLeft':
        next = (activeIndex - 1 + count) % count;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = count - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const style = variants[next].style;
    onSelect(style);
    tabRefs.current[style]?.focus();
  }

  return (
    <div className="min-w-0 space-y-2">
      <div
        role="tablist"
        aria-label="Translation tones"
        className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-surface-2 p-0.5"
      >
        {variants.map((variant, index) => {
          const selected = index === activeIndex;
          const entry = REWRITE_STYLE_CATALOG.find((s) => s.id === variant.style);
          return (
            <button
              key={variant.style}
              ref={(el) => {
                tabRefs.current[variant.style] = el;
              }}
              id={tabId(variant.style)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(variant.style)}
              onKeyDown={onKeyDown}
              className={cn(
                'inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[12px] font-medium transition-all duration-150',
                selected ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg',
              )}
            >
              {entry && <Icon name={entry.icon} size={13} strokeWidth={2} />}
              <span>{entry?.label ?? variant.style}</span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={tabId(active.style)}
        tabIndex={0}
        className="min-w-0 space-y-2 rounded-xl border border-border bg-surface p-3 shadow-card focus:outline-none focus:ring-2 focus:ring-brand/20"
      >
        <p
          lang={lang}
          dir={rtl ? 'rtl' : 'ltr'}
          className="select-text whitespace-pre-line break-words text-[13.5px] leading-6 text-fg"
        >
          {active.text}
        </p>
        <p className="text-right text-[11px] tabular-nums text-subtle">
          {activeIndex + 1} of {variants.length}
        </p>
      </div>
    </div>
  );
}
