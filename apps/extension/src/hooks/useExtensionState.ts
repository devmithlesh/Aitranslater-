import { useCallback, useEffect, useState } from 'react';
import { STORAGE_KEYS, sendToBackground, type ExtensionError, type ExtensionState } from '../shared/messages';

export interface ExtensionStateView {
  /** Latest snapshot from the background worker, or null until the first load succeeds. */
  state: ExtensionState | null;
  loading: boolean;
  error: ExtensionError | null;
  /** Re-reads the state from the background worker. */
  refresh: () => void;
}

/**
 * Loads the extension state via `verba:get-state` and stays in sync with
 * chrome.storage changes, so popup and options reflect connects, syncs and
 * settings edits made anywhere else.
 */
export function useExtensionState(): ExtensionStateView {
  const [state, setState] = useState<ExtensionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ExtensionError | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      const res = await sendToBackground({ type: 'verba:get-state' });
      if (!alive) return;
      if (res.ok) {
        setState(res.data);
        setError(null);
      } else {
        setError(res.error);
      }
      setLoading(false);
    };

    void load();

    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && STORAGE_KEYS.state in changes) void load();
    };
    chrome.storage.onChanged.addListener(onChanged);

    return () => {
      alive = false;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, [version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  return { state, loading, error, refresh };
}
