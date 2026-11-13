import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * A value persisted in chrome.storage.local (per device, not shared with the
 * dashboard). Reads once on mount, then writes changes, optionally debounced.
 * `loaded` is false until the stored value (or the fallback) is in place.
 */
export function useStoredValue<T>(
  key: string,
  fallback: T,
  guard: (value: unknown) => value is T,
  debounceMs = 0,
): [T, Dispatch<SetStateAction<T>>, boolean] {
  const [value, setValue] = useState<T>(fallback);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    readStorage(key).then((raw) => {
      if (!alive) return;
      if (guard(raw)) setValue(raw);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [key, guard]);

  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      void writeStorage(key, value);
    }, debounceMs);
    return () => clearTimeout(t);
  }, [key, value, loaded, debounceMs]);

  return [value, setValue, loaded];
}

async function readStorage(key: string): Promise<unknown> {
  try {
    const result = await chrome.storage.local.get(key);
    return result[key];
  } catch {
    return undefined;
  }
}

async function writeStorage(key: string, value: unknown): Promise<void> {
  try {
    await chrome.storage.local.set({ [key]: value });
  } catch {
    // Storage is a convenience only (draft, last tab). Ignore quota or context errors.
  }
}
