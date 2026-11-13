/** "12:00 AM" style time for a reset instant, in the viewer's locale. */
export function formatResetTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Fallback reset instant (next local midnight) for when the caller's credits have not loaded yet. */
export function nextLocalMidnightIso(now: Date = new Date()): string {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.toISOString();
}
