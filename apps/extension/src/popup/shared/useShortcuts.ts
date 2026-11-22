import { DEFAULT_SHORTCUTS, TRANSLATE_IN_PLACE_COMMAND } from '@verba/shared';
import { useEffect, useState } from 'react';

export interface Shortcuts {
  /** The keys that open the popup. Chrome's own setting, or the default while it is still loading. */
  openPopup: string;
  /** The keys that translate typed text in place. Empty when the user has not set any (or Chrome could not assign them). */
  translateInPlace: string;
}

const DEFAULTS: Shortcuts = { ...DEFAULT_SHORTCUTS };

/**
 * What the user's shortcuts really are. Chrome owns them and people change them at chrome://extensions/shortcuts,
 * so the popup reads them instead of printing fixed text.
 */
export function useShortcuts(): Shortcuts {
  const [shortcuts, setShortcuts] = useState<Shortcuts>(DEFAULTS);

  useEffect(() => {
    let alive = true;
    chrome.commands
      .getAll()
      .then((commands) => {
        if (!alive) return;
        const keysOf = (name: string): string | undefined => commands.find((command) => command.name === name)?.shortcut;
        setShortcuts({
          openPopup: keysOf('_execute_action') || DEFAULTS.openPopup,
          translateInPlace: keysOf(TRANSLATE_IN_PLACE_COMMAND) ?? '',
        });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  return shortcuts;
}

/** Opens Chrome's page where the shortcuts are set. */
export function openShortcutSettings(): void {
  void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }).catch(() => undefined);
}
