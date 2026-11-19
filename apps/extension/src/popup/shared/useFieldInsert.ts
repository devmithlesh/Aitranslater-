import { useCallback, useEffect, useState } from 'react';
import { insertIntoField, readFocusedField, type FocusedField } from '../translator/pageBridgeClient';

export interface FieldInsert {
  /** undefined while reading the page, null when there is no text box, otherwise the focused field. */
  field: FocusedField | null | undefined;
  /** True while an insert is in flight. */
  inserting: boolean;
  /** Why the last insert failed (the text is then copied to the clipboard when possible). */
  insertError: string | null;
  /** Replaces the focused field's text, then closes the popup. Falls back to the clipboard on failure. */
  insert: (text: string) => Promise<void>;
  /** Clears the insert error, e.g. when a new result replaces the old one. */
  clearInsertError: () => void;
}

/**
 * Reads the text box that was focused on the page when the popup opened, and inserts text into it.
 * The field is read once on mount. Insert closes the popup on success.
 */
export function useFieldInsert(): FieldInsert {
  const [field, setField] = useState<FocusedField | null | undefined>(undefined);
  const [inserting, setInserting] = useState(false);
  const [insertError, setInsertError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void readFocusedField().then((found) => {
      if (alive) setField(found);
    });
    return () => {
      alive = false;
    };
  }, []);

  const clearInsertError = useCallback(() => setInsertError(null), []);

  const insert = useCallback(
    async (text: string) => {
      if (!field || inserting) return;
      setInserting(true);
      setInsertError(null);
      const res = await insertIntoField(field.tabId, field.frameId, text);
      if (res.ok) {
        window.close();
        return;
      }
      // Never leave the user with nothing: keep the text on the clipboard so they can paste it.
      let copied = false;
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch {
        copied = false;
      }
      setInsertError(copied ? `${res.reason} The text is copied, so you can paste it yourself.` : res.reason);
      setInserting(false);
    },
    [field, inserting],
  );

  return { field, inserting, insertError, insert, clearInsertError };
}
