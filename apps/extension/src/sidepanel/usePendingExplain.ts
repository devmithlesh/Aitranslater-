import { useEffect, useState } from 'react';
import { PENDING_EXPLAIN_KEY, isPendingExplain, type PendingExplain } from '../shared/explain';

/**
 * Returns the selection the background worker last queued for "Explain with Verba",
 * or null when there is none. Watches chrome.storage.session so a new right-click
 * updates the open side panel without a reload.
 */
export function usePendingExplain(): PendingExplain | null {
  const [pending, setPending] = useState<PendingExplain | null>(null);

  useEffect(() => {
    let alive = true;

    void (async () => {
      try {
        const result = await chrome.storage.session.get(PENDING_EXPLAIN_KEY);
        const value: unknown = result[PENDING_EXPLAIN_KEY];
        if (alive && isPendingExplain(value)) setPending(value);
      } catch {
        // Session storage unavailable: stay empty instead of crashing the panel.
      }
    })();

    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'session' || !(PENDING_EXPLAIN_KEY in changes)) return;
      const next: unknown = changes[PENDING_EXPLAIN_KEY].newValue;
      if (isPendingExplain(next)) setPending(next);
    };

    try {
      chrome.storage.onChanged.addListener(onChanged);
    } catch {
      // Without the listener the panel still shows the value read on mount.
    }

    return () => {
      alive = false;
      try {
        chrome.storage.onChanged.removeListener(onChanged);
      } catch {
        // Context already gone; nothing to clean up.
      }
    };
  }, []);

  return pending;
}
