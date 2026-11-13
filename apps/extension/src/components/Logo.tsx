import { useId } from 'react';

/** Inline brand mark (violet to blue gradient). No network asset needed. */
export function LogoMark({ size = 24 }: { size?: number }) {
  const gradientId = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0 text-brand-fg">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: 'rgb(var(--brand))' }} />
          <stop offset="1" style={{ stopColor: 'rgb(var(--accent))' }} />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="7" fill={`url(#${gradientId})`} />
      <path d="M7 7.5 12 17l5-9.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
