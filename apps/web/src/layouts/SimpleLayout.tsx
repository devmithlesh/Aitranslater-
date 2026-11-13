import { Activity, Languages, LogOut, Monitor, Moon, Settings, Sun, Users, type LucideIcon } from 'lucide-react';
import { Suspense } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { IconButton, Spinner } from '@/components/ui';
import { useMe } from '@/features/credits/useMe';
import { useAppDispatch, useAppSelector } from '@/store';
import { disconnected } from '@/store/connectionSlice';
import { themeChanged, type ThemePreference } from '@/store/uiSlice';
import { cn } from '@/utils/cn';
import { Logo } from './Logo';

const THEME_ORDER: ThemePreference[] = ['light', 'dark', 'system'];
const THEME_ICONS = { light: Sun, dark: Moon, system: Monitor };

/** Admin-only destinations. Non-admins see just the translator. */
const ADMIN_LINKS: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Translator', icon: Languages, end: true },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/usage', label: 'API usage', icon: Activity },
];

/** Single-page shell: slim top bar with brand, theme, role-aware navigation, provider settings and disconnect. */
export function SimpleLayout() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const theme = useAppSelector((s) => s.ui.theme);
  const nextTheme = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length]!;
  const { isAdmin } = useMe();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur-md sm:px-6">
        <Logo />
        <div className="ml-auto flex items-center gap-1">
          <IconButton
            icon={THEME_ICONS[theme]}
            label={`Theme: ${theme} (switch to ${nextTheme})`}
            onClick={() => dispatch(themeChanged(nextTheme))}
          />
          {isAdmin && (
            <IconButton icon={Settings} label="AI provider settings" onClick={() => navigate('/settings/providers')} />
          )}
          <IconButton icon={LogOut} label="Disconnect" onClick={() => dispatch(disconnected())} />
        </div>
      </header>
      {isAdmin && (
        <nav aria-label="Admin" className="border-b border-border bg-bg px-4 py-2 sm:px-6">
          <ul className="flex items-center gap-1 overflow-x-auto">
            {ADMIN_LINKS.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[13px] font-medium transition-colors duration-150',
                      isActive ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-2 hover:text-fg',
                    )
                  }
                >
                  <Icon size={15} strokeWidth={2} aria-hidden />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <main className="mx-auto w-full px-4 py-8 sm:px-6">
        <Suspense
          fallback={
            <div className="flex justify-center py-24 text-brand">
              <Spinner size={22} />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
