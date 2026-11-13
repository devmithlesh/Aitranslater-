/** Where to go after signing in: the page the user was sent from, if it is an app page. */
export function readFromState(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) return '/';
  if (/^\/(login|signup|connect)(\/|$)/.test(from)) return '/';
  return from;
}

/** Set by RequireConnection when the stored session was rejected by the server. */
export function readUnauthorized(state: unknown): boolean {
  return (state as { reason?: unknown } | null)?.reason === 'unauthorized';
}
