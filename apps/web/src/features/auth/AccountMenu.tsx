import { KeyRound, LogOut, Puzzle } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui';
import { useAppDispatch } from '@/store';
import { useLogoutMutation, useMeQuery } from '@/store/api';
import { disconnected } from '@/store/connectionSlice';
import { cn } from '@/utils/cn';

function MenuLink({ to, icon, children, onNavigate }: { to: string; icon: ReactNode; children: ReactNode; onNavigate: () => void }) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium text-fg hover:bg-surface-2"
    >
      <span className="text-muted" aria-hidden>
        {icon}
      </span>
      {children}
    </Link>
  );
}

/** Header account button: name, email, plan, and the account actions (password, extension, log out). */
export function AccountMenu() {
  const me = useMeQuery();
  const dispatch = useAppDispatch();
  const [logout] = useLogoutMutation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  async function handleLogout() {
    setOpen(false);
    try {
      await logout().unwrap();
    } catch {
      /* The server may already have dropped the session; the local sign-out still applies. */
    }
    dispatch(disconnected());
  }

  const name = me.data?.name ?? 'Account';
  const email = me.data?.email ?? null;
  const unlimited = me.data?.plan === 'unlimited';
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const close = () => setOpen(false);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Account menu for ${name}`}
        title="Account"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-[13px] font-semibold text-brand transition-colors duration-150 hover:brightness-95',
          open && 'ring-4 ring-brand/15',
        )}
      >
        {initial}
      </button>

      {open && (
        <div
          id={panelId}
          className="absolute right-0 top-full z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] animate-scale-in rounded-2xl border border-border bg-surface p-2 shadow-pop"
        >
          <div className="space-y-1 px-2.5 pb-2.5 pt-2">
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-[14px] font-semibold text-fg">{name}</p>
              <Badge tone={unlimited ? 'brand' : 'neutral'}>{unlimited ? 'Unlimited' : 'Free'}</Badge>
            </div>
            {email && <p className="break-all text-[12.5px] text-muted">{email}</p>}
          </div>

          <div className="space-y-0.5 border-t border-border pt-2">
            {email !== null && (
              <MenuLink to="/account/password" icon={<KeyRound size={15} aria-hidden />} onNavigate={close}>
                Change password
              </MenuLink>
            )}
            <MenuLink to="/account/extension" icon={<Puzzle size={15} aria-hidden />} onNavigate={close}>
              Connect extension
            </MenuLink>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13.5px] font-medium text-fg hover:bg-surface-2"
            >
              <LogOut size={15} className="text-muted" aria-hidden />
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
