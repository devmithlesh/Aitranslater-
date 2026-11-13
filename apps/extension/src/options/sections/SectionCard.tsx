import type { ReactNode } from 'react';

/** A titled settings block. `id` is the anchor used by the section navigation. */
export function SectionCard({
  id,
  title,
  description,
  action,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 space-y-5 rounded-2xl border border-border bg-surface p-5 shadow-card">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-[15px] font-semibold tracking-tight">
            {title}
          </h2>
          {description && <p className="mt-1 text-[13px] leading-5 text-muted">{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/** Label + optional hint wrapper for a form control. */
export function Field({
  htmlFor,
  label,
  hint,
  children,
}: {
  htmlFor: string;
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[12.5px] font-medium text-fg">
        {label}
      </label>
      {children}
      {hint && <div className="text-[12px] leading-5 text-muted">{hint}</div>}
    </div>
  );
}

/** Inline result line for saves and connection attempts. */
export function Notice({ tone, children }: { tone: 'success' | 'error' | 'muted'; children: ReactNode }) {
  const classes = {
    success: 'text-success',
    error: 'text-danger',
    muted: 'text-muted',
  } as const;
  return (
    <p role="status" className={`text-[12.5px] leading-5 ${classes[tone]}`}>
      {children}
    </p>
  );
}
