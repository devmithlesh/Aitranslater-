import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { Field, IconButton, Input } from '@/components/ui';

export interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  error?: string | null;
  hint?: string;
}

/** Password input with a show/hide toggle. The toggle is a button, so it is reachable by keyboard. */
export function PasswordField({ label, value, onChange, autoComplete, error, hint }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label} error={error} hint={hint}>
      {(id) => (
        <div className="relative">
          <Input
            id={id}
            type={visible ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoComplete={autoComplete}
            spellCheck={false}
            invalid={!!error}
            className="pr-11"
          />
          <IconButton
            icon={visible ? EyeOff : Eye}
            label={visible ? 'Hide password' : 'Show password'}
            size="sm"
            className="absolute right-1.5 top-1/2 -translate-y-1/2"
            onClick={() => setVisible((v) => !v)}
          />
        </div>
      )}
    </Field>
  );
}
