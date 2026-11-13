import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/store';
import { toastAdded, toastDismissed, type Toast } from '@/store/uiSlice';
import { cn } from '@/utils/cn';

const icons = { success: CheckCircle2, error: XCircle, info: Info };
const colors = { success: 'text-success', error: 'text-danger', info: 'text-brand' };

function ToastItem({ toast }: { toast: Toast }) {
  const dispatch = useAppDispatch();
  const Icon = icons[toast.tone];
  useEffect(() => {
    const t = setTimeout(() => dispatch(toastDismissed(toast.id)), toast.tone === 'error' ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [dispatch, toast.id, toast.tone]);

  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className="pointer-events-auto flex w-80 items-start gap-3 rounded-xl border border-border bg-surface p-3.5 shadow-pop animate-slide-up"
    >
      <Icon size={18} className={cn('mt-0.5 shrink-0', colors[toast.tone])} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium text-fg">{toast.title}</p>
        {toast.description && <p className="mt-0.5 text-[12.5px] text-muted">{toast.description}</p>}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => dispatch(toastDismissed(toast.id))}
        className="rounded-md p-0.5 text-subtle hover:text-fg"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function Toaster() {
  const toasts = useAppSelector((s) => s.ui.toasts);
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

/** `const toast = useToast(); toast.success('Copied')` */
export function useToast() {
  const dispatch = useAppDispatch();
  const show = useCallback(
    (tone: Toast['tone'], title: string, description?: string) => dispatch(toastAdded({ tone, title, description })),
    [dispatch],
  );
  return {
    success: useCallback((t: string, d?: string) => show('success', t, d), [show]),
    error: useCallback((t: string, d?: string) => show('error', t, d), [show]),
    info: useCallback((t: string, d?: string) => show('info', t, d), [show]),
  };
}
