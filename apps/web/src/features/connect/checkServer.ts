import { CLIENT_HEADER, type HealthResponse, type VerifyResponse } from '@verba/shared';

const CHECK_TIMEOUT_MS = 8_000;

/** Error whose message is safe to show to the user as-is. */
export class ConnectCheckError extends Error {}

async function fetchWithTimeout(url: string, token?: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  const headers: Record<string, string> = { [CLIENT_HEADER]: 'web' };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    return await fetch(url, { headers, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ConnectCheckError(`The server at ${displayUrl(url)} did not respond within 8 seconds.`);
    }
    throw new ConnectCheckError(
      `Can't reach the server at ${displayUrl(url)}. Is the backend running? (npm run dev:backend)`,
    );
  } finally {
    clearTimeout(timer);
  }
}

function displayUrl(url: string): string {
  return url.replace(/\/api\/.*$/, '');
}

/**
 * Confirms the URL points at a Verba backend and that the token is accepted.
 * Throws ConnectCheckError with a user-facing message on any failure.
 */
export async function checkServer(apiUrl: string, token: string): Promise<void> {
  const health = await fetchWithTimeout(`${apiUrl}/api/health`);
  if (!health.ok) {
    throw new ConnectCheckError(`The server at ${displayUrl(apiUrl)} responded with an error (${health.status}).`);
  }
  const body = (await health.json().catch(() => null)) as Partial<HealthResponse> | null;
  if (body?.name !== 'verba') {
    throw new ConnectCheckError(`${displayUrl(apiUrl)} is not a Verba server.`);
  }

  const verify = await fetchWithTimeout(`${apiUrl}/api/auth/verify`, token);
  if (verify.status === 401) {
    throw new ConnectCheckError('That token was rejected.');
  }
  if (!verify.ok) {
    throw new ConnectCheckError(`Verification failed (${verify.status}). Try again in a moment.`);
  }
  const ok = (await verify.json().catch(() => null)) as Partial<VerifyResponse> | null;
  if (!ok?.ok) {
    throw new ConnectCheckError('The server sent an unexpected response.');
  }
}
