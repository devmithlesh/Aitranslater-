import type { LucideIcon } from 'lucide-react';
import { cn } from './cn';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the group. */
  label: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
}

/** Pill-style single-select built from toggle buttons (aria-pressed). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
  disabled,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'inline-flex max-w-full rounded-xl border border-border bg-surface-2 p-0.5',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] font-medium transition-all duration-150',
              size === 'sm' ? 'h-7 px-2 text-[12px]' : 'h-8 px-3 text-[13px]',
              active ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg',
            )}
          >
            {Icon && <Icon size={14} strokeWidth={2} aria-hidden />}
            <span className="truncate">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
