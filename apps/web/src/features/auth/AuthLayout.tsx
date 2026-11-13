import type { ReactNode } from 'react';
import { ConnectBrandPanel } from '@/features/connect/ConnectBrandPanel';

/** Split sign-in shell: brand story on desktop, the form column on every screen size. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <ConnectBrandPanel className="hidden min-h-screen lg:flex" />
      <main className="flex min-h-screen flex-col justify-center px-4 py-10 sm:px-8 lg:px-12">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <img src="/favicon.svg" alt="" className="h-9 w-9 rounded-xl shadow-glow" />
            <span className="text-lg font-semibold tracking-tight text-fg">Verba</span>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

export interface AuthCardProps {
  title: string;
  description?: string;
  children: ReactNode;
}

/** The bordered card that holds one auth form, matching the connect page look. */
export function AuthCard({ title, description, children }: AuthCardProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-pop animate-scale-in">
      <div className="space-y-1 px-6 pb-5 pt-6 sm:px-8">
        <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
        {description && <p className="text-[13.5px] text-muted">{description}</p>}
      </div>
      <div className="px-6 pb-6 sm:px-8">{children}</div>
    </section>
  );
}
