import { MAX_INPUT_CHARS } from '@verba/shared';

/** True when the text is non-empty and within the backend input limit. */
export function canSubmit(text: string, max: number = MAX_INPUT_CHARS): boolean {
  return text.trim().length > 0 && text.length <= max;
}
