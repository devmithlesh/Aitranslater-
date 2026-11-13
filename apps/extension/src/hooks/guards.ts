/** Type guards for values read back from chrome.storage. */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

