import type { ReactNode } from 'react';

export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-2 px-3.5 py-3">
      <p className="break-words text-[12px] text-subtle">{label}</p>
      <p className="mt-0.5 break-words text-[20px] font-semibold tabular-nums tracking-tight text-fg">{value}</p>
      {hint && <p className="mt-0.5 break-words text-[12px] text-muted">{hint}</p>}
    </div>
  );
}
