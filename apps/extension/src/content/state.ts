import { DEFAULT_SETTINGS, type UserSettings } from '@verba/shared';
import { STORAGE_KEYS, type ExtensionState } from '../shared/messages';
import { isExtensionState } from '../lib/guards';
import { isHostDisabled } from '../lib/policy';

export type EffectiveSettings = Omit<UserSettings, 'updatedAt'>;

let cached: ExtensionState | null = null;

function setCached(next: ExtensionState | null): void {
  cached = next;
}

/** Defaults merged under whatever the backend last synced. */
export function effectiveSettings(state: ExtensionState | null): EffectiveSettings {
  const saved = state?.settings ?? null;
  return {
    ...DEFAULT_SETTINGS,
    ...(saved ?? {}),
    extension: { ...DEFAULT_SETTINGS.extension, ...(saved?.extension ?? {}) },
  };
}

/** False when the user disabled Verba globally or for this site. */
export function isActiveHere(): boolean {
  const { extension } = effectiveSettings(cached);
  if (!extension.enabled) return false;
  return !isHostDisabled(location.hostname, extension.disabledSites);
}

/** Loads the cached state and keeps it in sync with chrome.storage.local. Never throws. */
export function startStateSync(): void {
  try {
    void chrome.storage.local
      .get(STORAGE_KEYS.state)
      .then((raw) => {
        const value: unknown = raw[STORAGE_KEYS.state];
        setCached(isExtensionState(value) ? value : null);
      })
      .catch(() => undefined);

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      const change = changes[STORAGE_KEYS.state];
      if (!change) return;
      const value: unknown = change.newValue;
      setCached(isExtensionState(value) ? value : null);
    });
  } catch {
    // Extension context invalidated (extension reloaded): stay idle.
  }
}
