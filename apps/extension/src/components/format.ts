/** "3m ago", "2h ago", "5d ago", or a locale date for older values. Empty string when unparseable. */
export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const seconds = Math.round((now - t) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(t).toLocaleDateString();
}

/** Collapses whitespace and cuts to `max` characters with an ellipsis. */
export function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** Splits a Chrome shortcut string ("Alt+Shift+A") into key labels. */
export function shortcutKeys(shortcut: string): string[] {
  return shortcut
    .split('+')
    .map((k) => k.trim())
    .filter(Boolean);
}
