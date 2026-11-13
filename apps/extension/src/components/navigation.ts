import { sendToBackground, type Result } from '../shared/messages';

/** Opens the web dashboard (optionally at a path) via the background worker. */
export function openDashboard(path?: string): Promise<Result<null>> {
  return sendToBackground({ type: 'verba:open-dashboard', path });
}

/** Opens the extension settings page. Falls back to a tab if the native call is unavailable. */
export async function openOptions(): Promise<boolean> {
  try {
    await chrome.runtime.openOptionsPage();
    return true;
  } catch {
    try {
      await chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
      return true;
    } catch {
      return false;
    }
  }
}
