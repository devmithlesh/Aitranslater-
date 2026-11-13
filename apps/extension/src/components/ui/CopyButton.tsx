import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from './Button';

/** Clipboard write with a fallback for pages where the async Clipboard API is blocked. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export interface CopyButtonProps {
  text: string;
  label?: string;
  size?: 'sm' | 'md';
  variant?: 'outline' | 'ghost' | 'secondary';
}

export function CopyButton({ text, label = 'Copy', size = 'sm', variant = 'outline' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!copied && !failed) return;
    const t = setTimeout(() => {
      setCopied(false);
      setFailed(false);
    }, 1600);
    return () => clearTimeout(t);
  }, [copied, failed]);

  return (
    <Button
      variant={variant}
      size={size}
      icon={copied ? Check : Copy}
      disabled={!text}
      onClick={async () => {
        if (await copyToClipboard(text)) setCopied(true);
        else setFailed(true);
      }}
    >
      {failed ? 'Copy failed' : copied ? 'Copied' : label}
    </Button>
  );
}
