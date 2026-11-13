import type { CustomAssistant, UserSettings } from '@verba/shared';
import type { ExtensionState, Result } from '../shared/messages';
import { fail, ok } from '../lib/result';
import { asUserSettings, isCustomAssistant, isRecord } from '../lib/guards';
import { patchState, readConnection } from '../lib/storage';
import { callBackend } from './backend';

/** Re-fetches settings and assistants and caches them in the public state record. */
export async function syncNow(): Promise<Result<ExtensionState>> {
  const connection = await readConnection();
  if (!connection) {
    return fail('NOT_CONNECTED', 'Connect Verba to your server in the extension settings.');
  }

  const [settingsRes, assistantsRes] = await Promise.all([
    callBackend('GET', '/settings'),
    callBackend('GET', '/assistants'),
  ]);

  if (!settingsRes.ok || !assistantsRes.ok) {
    const error = !settingsRes.ok ? settingsRes.error : !assistantsRes.ok ? assistantsRes.error : null;
    const message = error?.message ?? 'Sync failed.';
    await patchState({ lastError: message });
    return fail(error?.code ?? 'INTERNAL', message, { status: error?.status });
  }

  const settings: UserSettings | null = asUserSettings(settingsRes.data);
  if (!settings) {
    await patchState({ lastError: 'Verba returned unexpected settings.' });
    return fail('INTERNAL', 'Verba returned unexpected settings.');
  }

  const raw = isRecord(assistantsRes.data) && Array.isArray(assistantsRes.data.items) ? assistantsRes.data.items : [];
  const assistants: CustomAssistant[] = raw.filter(isCustomAssistant).filter((a) => a.showInExtension);

  const state = await patchState({
    settings,
    assistants,
    lastSyncAt: new Date().toISOString(),
    lastError: null,
  });
  return ok(state);
}

/** Tells the backend this extension is alive. Failures are recorded, never thrown. */
export async function sendHeartbeat(): Promise<void> {
  const connection = await readConnection();
  if (!connection) return;
  const result = await callBackend('POST', '/extension/heartbeat', {
    version: chrome.runtime.getManifest().version,
    userAgent: navigator.userAgent,
  });
  if (!result.ok) {
    await patchState({ lastError: result.error.message });
  }
}

/** Alarm / startup / install entry point. Never throws. */
export async function runScheduledSync(): Promise<void> {
  try {
    if (!(await readConnection())) return;
    await syncNow();
    await sendHeartbeat();
  } catch (err) {
    console.warn('Verba: scheduled sync failed', err instanceof Error ? err.name : 'unknown');
  }
}
