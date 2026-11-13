import {
  getLanguage,
  languageName,
  REWRITE_STYLE_CATALOG,
  type RewriteStyle,
  type TranslateVariantsResponse,
} from '@verba/shared';
import { Lightbulb } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import { Badge, Card, CopyButton, Icon } from '@/components/ui';
import { cn } from '@/utils/cn';

export interface VariantResultsProps {
  result: TranslateVariantsResponse;
  targetLang: string;
}

function styleEntry(style: RewriteStyle) {
  return REWRITE_STYLE_CATALOG.find((e) => e.id === style);
}

/** One tab per tone; only the selected version is shown. The chosen tab survives new translations. */
export function VariantResults({ result, targetLang }: VariantResultsProps) {
  const [selected, setSelected] = useState<RewriteStyle | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const { variants } = result;
  const index = Math.max(0, variants.findIndex((v) => v.style === selected));
  const active = variants[index];
  const dir = getLanguage(targetLang)?.rtl ? 'rtl' : 'ltr';

  if (!active) {
    return (
      <Card className="p-5 text-[13.5px] text-muted">The AI returned no translations. Try again.</Card>
    );
  }

  const select = (i: number) => {
    const next = (i + variants.length) % variants.length;
    setSelected(variants[next].style);
    tabRefs.current[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: variants.length - 1 };
    if (event.key in moves) {
      event.preventDefault();
      select(moves[event.key]);
    }
  };

  return (
    <Card className="animate-fade-in flex flex-col overflow-hidden">
      <div
        role="tablist"
        aria-label="Translation styles"
        onKeyDown={onKeyDown}
        className="flex gap-1 overflow-x-auto border-b border-border px-2 pt-2"
      >
        {variants.map((v, i) => {
          const entry = styleEntry(v.style);
          const isActive = i === index;
          return (
            <button
              key={v.style}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`variant-tab-${v.style}`}
              aria-selected={isActive}
              aria-controls="variant-panel"
              tabIndex={isActive ? 0 : -1}
              onClick={() => setSelected(v.style)}
              className={cn(
                '-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors',
                isActive ? 'border-brand text-fg' : 'border-transparent text-muted hover:text-fg',
              )}
            >
              <Icon name={entry?.icon ?? 'Sparkles'} size={15} strokeWidth={2} />
              {entry?.label ?? v.style}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id="variant-panel"
        aria-labelledby={`variant-tab-${active.style}`}
        className="flex min-h-[220px] flex-1 flex-col p-5"
      >
        <p lang={targetLang} dir={dir} className="flex-1 select-text whitespace-pre-line break-words text-[17px] leading-8 text-fg">
          {active.text}
        </p>
        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="text-[12.5px] text-subtle">
            {index + 1} of {variants.length}
          </span>
          <CopyButton text={active.text} label="Copy" />
        </div>
      </div>

      <div className="border-t border-border bg-surface-2/50 px-5 py-4">
        <div className="mb-1.5 flex items-center gap-2">
          <Lightbulb size={14} strokeWidth={2} aria-hidden className="text-brand" />
          <span className="text-[12.5px] font-semibold text-muted">What it means</span>
          {result.detectedSourceLang && (
            <Badge tone="brand" className="ml-auto">
              {languageName(result.detectedSourceLang)}
              {result.romanized && ' · romanized'}
            </Badge>
          )}
        </div>
        <p lang={targetLang} dir={dir} className="select-text break-words text-[13.5px] leading-6 text-muted">
          {result.meaning}
        </p>
      </div>
    </Card>
  );
}
