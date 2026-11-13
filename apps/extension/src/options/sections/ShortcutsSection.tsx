import { ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { shortcutKeys } from '../../components/format';
import { Button } from '../../components/ui/Button';
import { Kbd } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Spinner';
import { Notice, SectionCard } from './SectionCard';

const SHORTCUTS_URL = 'chrome://extensions/shortcuts';

export function ShortcutsSection() {
  const [commands, setCommands] = useState<chrome.commands.Command[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openError, setOpenError] = useState(false);

  useEffect(() => {
    let alive = true;
    chrome.commands
      .getAll()
      .then((list) => {
        if (alive) setCommands(list);
      })
      .catch(() => {
        if (alive) setLoadError('Could not read your keyboard shortcuts.');
      });
    return () => {
      alive = false;
    };
  }, []);

  async function openShortcutsPage() {
    setOpenError(false);
    try {
      await chrome.tabs.create({ url: SHORTCUTS_URL });
    } catch {
      setOpenError(true);
    }
  }

  return (
    <SectionCard
      id="shortcuts"
      title="Keyboard shortcuts"
      description="Chrome manages shortcuts. Changes you make on the Chrome shortcuts page apply immediately."
      action={
        <Button variant="outline" size="sm" icon={ExternalLink} onClick={() => void openShortcutsPage()}>
          Change shortcuts
        </Button>
      }
    >
      {commands === null && !loadError && (
        <div className="space-y-2" aria-label="Loading shortcuts">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {loadError && <Notice tone="error">{loadError}</Notice>}

      {commands && commands.length === 0 && (
        <p className="text-[12.5px] text-subtle">No shortcuts are defined for this extension.</p>
      )}

      {commands && commands.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {commands.map((command) => {
            const keys = command.shortcut ? shortcutKeys(command.shortcut) : [];
            return (
              <li key={command.name} className="flex items-center justify-between gap-4 px-4 py-3">
                <p className="min-w-0 text-[13px]">{command.description || command.name}</p>
                {keys.length > 0 ? (
                  <div className="flex shrink-0 items-center gap-1">
                    {keys.map((key, i) => (
                      <Kbd key={`${key}-${i}`}>{key}</Kbd>
                    ))}
                  </div>
                ) : (
                  <span className="shrink-0 text-[12.5px] text-subtle">Not set</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {openError && <Notice tone="error">Could not open Chrome shortcuts. Open chrome://extensions/shortcuts manually.</Notice>}
    </SectionCard>
  );
}
