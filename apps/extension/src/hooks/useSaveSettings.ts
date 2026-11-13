import { useCallback, useState } from 'react';
import type { UserSettings, UserSettingsUpdate } from '@verba/shared';
import { callApi, sendToBackground, type Result } from '../shared/messages';

/**
 * Saves a settings patch with PUT /settings, then asks the background worker to
 * sync so the dashboard, the toolbar and every open tab pick up the change.
 * `onSaved` runs after the sync so the caller can refresh its view.
 */
export function useSaveSettings(onSaved?: () => void) {
  const [saving, setSaving] = useState(false);

  const save = useCallback(
    async (update: UserSettingsUpdate): Promise<Result<UserSettings>> => {
      setSaving(true);
      const res = await callApi<UserSettings>('PUT', '/settings', update);
      if (res.ok) {
        // A failed sync is reported through state.lastError; the save itself succeeded.
        await sendToBackground({ type: 'verba:sync' });
      }
      setSaving(false);
      onSaved?.();
      return res;
    },
    [onSaved],
  );

  return { save, saving };
}
