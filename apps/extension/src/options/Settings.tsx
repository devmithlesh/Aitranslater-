import { Info, Keyboard, Languages, MousePointerClick, Plug, ShieldCheck } from 'lucide-react';
import { LogoMark } from '../components/Logo';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Skeleton } from '../components/ui/Spinner';
import { useExtensionState } from '../hooks/useExtensionState';
import { localError } from '../components/errors';
import { AboutSection } from './sections/AboutSection';
import { ConnectionSection } from './sections/ConnectionSection';
import { LanguagesSection } from './sections/LanguagesSection';
import { PrivacySection } from './sections/PrivacySection';
import { ShortcutsSection } from './sections/ShortcutsSection';
import { ToolbarSection } from './sections/ToolbarSection';

const NAV = [
  { id: 'connection', label: 'Connection', icon: Plug },
  { id: 'toolbar', label: 'Toolbar & behaviour', icon: MousePointerClick },
  { id: 'languages', label: 'Languages', icon: Languages },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
  { id: 'privacy', label: 'Privacy', icon: ShieldCheck },
  { id: 'about', label: 'About', icon: Info },
] as const;

export function Settings() {
  const { state, loading, error, refresh } = useExtensionState();

  return (
    <div className="min-h-screen bg-bg text-fg">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 pt-8">
        <LogoMark size={30} />
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight">Verba settings</h1>
          <p className="text-[12.5px] text-muted">Manage your connection, toolbar, languages and privacy.</p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 pb-16 pt-6">
        <nav aria-label="Settings sections" className="-mx-1 mb-5 flex gap-1 overflow-x-auto pb-1 md:hidden">
          {NAV.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="shrink-0 rounded-full border border-border bg-surface px-3 py-1 text-[12.5px] font-medium text-muted hover:text-fg"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex gap-8">
          <nav aria-label="Settings sections" className="sticky top-8 hidden h-fit w-44 shrink-0 md:block">
            <ul className="space-y-0.5">
              {NAV.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg"
                  >
                    <item.icon size={15} strokeWidth={2} aria-hidden />
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <main className="min-w-0 flex-1 space-y-6">
            {loading && !state && (
              <div className="space-y-3" aria-label="Loading settings">
                <Skeleton className="h-32 w-full rounded-2xl" />
                <Skeleton className="h-48 w-full rounded-2xl" />
              </div>
            )}

            {!loading && !state && (
              <ErrorMessage error={error ?? localError('Verba did not respond. Try again.')} onRetry={refresh} />
            )}

            {!loading && (
              <>
                <ConnectionSection state={state} refresh={refresh} />
                <ToolbarSection state={state} refresh={refresh} />
                <LanguagesSection state={state} refresh={refresh} />
                <ShortcutsSection />
                <PrivacySection />
                <AboutSection />
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
