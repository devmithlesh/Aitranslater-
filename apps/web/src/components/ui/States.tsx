import { AlertTriangle, KeyRound, RefreshCw, WifiOff, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { AppError } from '@/store/api';
import { cn } from '@/utils/cn';
import { Button } from './Button';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center animate-fade-in', className)}>
      <div className="relative mb-4">
        <div aria-hidden className="absolute inset-0 rounded-2xl bg-brand-gradient opacity-20 blur-xl" />
        <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface text-brand shadow-card">
          <Icon size={22} strokeWidth={1.75} />
        </div>
      </div>
      <h3 className="text-[15px] font-semibold text-fg">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/**
 * Renders an AppError with a tailored hint:
 * - no provider configured → link to provider settings
 * - network → server-not-running hint
 */
export function ErrorState({
  error,
  onRetry,
  compact,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  compact?: boolean;
  className?: string;
}) {
  const e = (error ?? {}) as Partial<AppError>;
  const message = e.message ?? 'Something went wrong.';
  const isNetwork = e.code === 'NETWORK_ERROR';
  const isProvider = e.code === 'NO_PROVIDER_CONFIGURED';
  const Icon = isNetwork ? WifiOff : isProvider ? KeyRound : AlertTriangle;

  return (
    <div
      role="alert"
      className={cn(
        'flex gap-3 rounded-xl border border-danger/20 bg-danger-soft text-fg animate-fade-in',
        compact ? 'items-center p-3' : 'items-start p-4',
        className,
      )}
    >
      <Icon size={18} className="mt-0.5 shrink-0 text-danger" aria-hidden />
      <div className="min-w-0 flex-1 text-[13px]">
        <p className="font-medium">{message}</p>
        {isProvider && !compact && (
          <p className="mt-1 text-muted">
            Add an API key or enable a self-hosted provider in{' '}
            <Link to="/settings/providers" className="font-medium text-brand underline-offset-2 hover:underline">
              Provider settings
            </Link>
            .
          </p>
        )}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" icon={RefreshCw} onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
