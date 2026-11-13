import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from './Button';
import { useToast } from './Toaster';

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for insecure contexts (http on LAN) where the Clipboard API is blocked.
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

export function CopyButton({
  text,
  label = 'Copy',
  size = 'sm',
  variant = 'outline',
}: {
  text: string;
  label?: string;
  size?: 'sm' | 'md';
  variant?: 'outline' | 'ghost' | 'secondary';
}) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <Button
      variant={variant}
      size={size}
      icon={copied ? Check : Copy}
      disabled={!text}
      onClick={async () => {
        if (await copyToClipboard(text)) setCopied(true);
        else toast.error('Could not copy', 'Your browser blocked clipboard access.');
      }}
    >
      {copied ? 'Copied' : label}
    </Button>
  );
}
