import { DEFAULT_SETTINGS } from '@verba/shared';
import type { UserSettings } from '@verba/shared';
import type { Storage } from '../storage/types';
import type { SettingsPatch } from '../schemas';

/** Merges stored settings over defaults so newly added keys get sensible values. */
function withDefaults(stored: UserSettings | undefined): UserSettings {
  if (!stored) {
    return { ...structuredClone(DEFAULT_SETTINGS), updatedAt: new Date(0).toISOString() };
  }
  // Older saved settings may still carry the removed history options: drop them.
  const { saveHistory: _saveHistory, historyRetentionDays: _retention, ...kept } = stored as UserSettings & {
    saveHistory?: unknown;
    historyRetentionDays?: unknown;
  };
  return {
    ...structuredClone(DEFAULT_SETTINGS),
    ...kept,
    extension: { ...structuredClone(DEFAULT_SETTINGS.extension), ...stored.extension },
  };
}

export class SettingsService {
  constructor(
    private readonly storage: Storage,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async get(userId: string): Promise<UserSettings> {
    return withDefaults(await this.storage.getSettings(userId));
  }

  /** Deep-merges the `extension` block; every other array or value is replaced. */
  async update(userId: string, patch: SettingsPatch): Promise<UserSettings> {
    const current = await this.get(userId);
    const { extension, ...rest } = patch;
    const next: UserSettings = {
      ...current,
      ...rest,
      extension: { ...current.extension, ...extension },
      updatedAt: this.now().toISOString(),
    };
    await this.storage.saveSettings(userId, next);
    return next;
  }
}
