import type { ReactNode } from 'react';
import { Field, Input } from '@/components/ui';
import { cn } from '@/utils/cn';

export interface LimitInputProps {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  hint?: ReactNode;
  placeholder?: string;
  className?: string;
}

/** Numeric text field for a daily limit. The parent parses it with parseLimitInput. */
export function LimitInput({ label, value, onChange, error, hint, placeholder = 'Unlimited', className }: LimitInputProps) {
  return (
    <Field label={label} error={error} hint={hint} className={cn('min-w-0', className)}>
      {(id) => (
        <Input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          invalid={!!error}
          onChange={(e) => onChange(e.target.value)}
          className="tabular-nums"
        />
      )}
    </Field>
  );
}
