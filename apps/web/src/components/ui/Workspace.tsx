/**
 * Page building blocks: <PageHeader>, the <TextEditor> input card and the privacy notice.
 */
import { MAX_INPUT_CHARS } from '@verba/shared';
import { Eraser, ShieldCheck } from 'lucide-react';
import type { ReactNode, TextareaHTMLAttributes } from 'react';
import { useSettingsQuery } from '@/store/api';
import { cn } from '@/utils/cn';
import { formatNumber } from '@/utils/format';
import { IconButton } from './Button';
import { Card } from './Card';

export function PageHeader({
  title,
  description,
  icon,
  actions,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-center gap-3.5">
        {icon && (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-glow">
            {icon}
          </div>
        )}
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-fg">{title}</h1>
          {description && <p className="mt-0.5 text-[13.5px] text-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export interface TextEditorProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
  /** Toolbar above the text area (language pickers, style chips). */
  header?: ReactNode;
  /** Actions in the footer, right side (primary submit button). */
  footer?: ReactNode;
  /** Called on Ctrl/Cmd+Enter. */
  onSubmit?: () => void;
  maxChars?: number;
  minRows?: number;
}

/** Large, borderless text area inside a card with char counter, clear and ⌘↵ submit. */
export function TextEditor({
  value,
  onChange,
  header,
  footer,
  onSubmit,
  maxChars = MAX_INPUT_CHARS,
  minRows = 8,
  className,
  placeholder = 'Type or paste your text…',
  ...rest
}: TextEditorProps) {
  const over = value.length > maxChars;
  return (
    <Card className={cn('flex flex-col overflow-hidden focus-within:border-brand/50 focus-within:ring-4 focus-within:ring-brand/10', className)}>
      {header && <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">{header}</div>}
      <textarea
        dir="auto"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && onSubmit && !over && value.trim()) {
            e.preventDefault();
            onSubmit();
          }
        }}
        rows={minRows}
        placeholder={placeholder}
        spellCheck
        className="min-h-[180px] w-full flex-1 resize-none bg-transparent px-5 py-4 text-[15px] leading-7 text-fg placeholder:text-subtle focus:outline-none"
        {...rest}
      />
      <div className="flex items-center gap-2 border-t border-border px-3 py-2">
        <IconButton icon={Eraser} label="Clear text" size="sm" disabled={!value} onClick={() => onChange('')} />
        <span className={cn('text-[12px] tabular-nums', over ? 'font-medium text-danger' : 'text-subtle')}>
          {formatNumber(value.length)} / {formatNumber(maxChars)}
        </span>
        {onSubmit && (
          <span className="hidden text-[12px] text-subtle md:inline">
            · <kbd className="font-sans">Ctrl</kbd> + <kbd className="font-sans">Enter</kbd> to run
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">{footer}</div>
      </div>
    </Card>
  );
}

/** "Text you submit is sent to …" notice; hidden when the user turned notices off. */
export function PrivacyNotice({ what = 'AI provider' }: { what?: string }) {
  const { data } = useSettingsQuery();
  if (data && !data.showPrivacyNotice) return null;
  return (
    <p className="mt-3 flex items-center gap-1.5 text-[12px] text-subtle">
      <ShieldCheck size={13} aria-hidden />
      Text is only sent to your configured {what} when you run an action. Nothing is sent while typing.
    </p>
  );
}
