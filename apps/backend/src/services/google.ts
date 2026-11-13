import { createPublicKey, verify as verifySignature } from 'node:crypto';
import type { JsonWebKey } from 'node:crypto';
import { unauthorized } from '../utils/errors';
import { isRecord } from '../utils/json';

/** Google's public signing keys for ID tokens (RS256). */
export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

const GOOGLE_ISSUERS: ReadonlySet<string> = new Set(['accounts.google.com', 'https://accounts.google.com']);
const FAILED_MESSAGE = 'Google sign-in failed.';
const SEGMENT = /^[A-Za-z0-9_-]+$/;
const DEFAULT_CACHE_MS = 60 * 60 * 1000;
const MAX_CACHE_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;
const CLOCK_LEEWAY_MS = 60 * 1000;
const FUTURE_IAT_LIMIT_S = 300;

export type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

/** The verified facts about a Google account that Verba needs. */
export interface GoogleIdentity {
  /** Google's stable account id ("sub"). */
  sub: string;
  /** Lower-cased, trimmed, and email_verified is true. */
  email: string;
  name: string | null;
}

/**
 * Caches Google's JWKS in memory, keyed by kid. The cache lives on one app instance (not at module level),
 * so separate apps and tests never share key material.
 */
export class GoogleKeyCache {
  private keys = new Map<string, JsonWebKey>();
  private expiresAt = 0;

  /** Returns the key for `kid`. A fresh cache that lacks the kid is refetched once. */
  async find(kid: string, nowMs: number, fetchImpl: FetchImpl): Promise<JsonWebKey | undefined> {
    if (!(nowMs < this.expiresAt && this.keys.has(kid))) {
      await this.refresh(nowMs, fetchImpl);
    }
    return this.keys.get(kid);
  }

  private async refresh(nowMs: number, fetchImpl: FetchImpl): Promise<void> {
    const response = await fetchImpl(GOOGLE_JWKS_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) throw new Error('Google key set unavailable.');
    const body: unknown = await response.json();
    if (!isRecord(body) || !Array.isArray(body.keys)) throw new Error('Malformed Google key set.');

    const keys = new Map<string, JsonWebKey>();
    for (const entry of body.keys) {
      if (isRecord(entry) && typeof entry.kid === 'string' && entry.kty === 'RSA') {
        keys.set(entry.kid, entry as JsonWebKey);
      }
    }
    this.keys = keys;
    this.expiresAt = nowMs + cacheLifetimeMs(response.headers.get('cache-control'));
  }
}

/** Honours Cache-Control max-age, capped at 24 hours. Without it, one hour. */
function cacheLifetimeMs(header: string | null): number {
  const match = header?.match(/max-age=(\d+)/i);
  if (!match) return DEFAULT_CACHE_MS;
  return Math.min(Number(match[1]) * 1000, MAX_CACHE_MS);
}

function decodeSegment(segment: string): Record<string, unknown> {
  if (!SEGMENT.test(segment)) throw new Error('Malformed token segment.');
  const parsed: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
  if (!isRecord(parsed)) throw new Error('Token segment is not an object.');
  return parsed;
}

export interface VerifyOptions {
  fetchImpl?: FetchImpl;
  now?: () => Date;
  keys?: GoogleKeyCache;
}

/**
 * Verifies a Google ID token: RS256 signature against Google's JWKS, issuer, audience (the client id),
 * expiry (with a minute of leeway), issued-at not in the future, and a verified email. Any failure
 * throws 401 "Google sign-in failed." so the reason is not revealed to the caller.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  clientId: string,
  options: VerifyOptions = {},
): Promise<GoogleIdentity> {
  const fetchImpl: FetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const nowMs = (options.now ?? (() => new Date()))().getTime();
  const keys = options.keys ?? new GoogleKeyCache();

  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) throw new Error('Not a JWT.');
    const [headerPart, payloadPart, signaturePart] = parts;
    const header = decodeSegment(headerPart);
    const payload = decodeSegment(payloadPart);

    if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('Unsupported algorithm.');
    const jwk = await keys.find(header.kid, nowMs, fetchImpl);
    if (!jwk) throw new Error('Unknown signing key.');

    const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
    const signed = Buffer.from(`${headerPart}.${payloadPart}`, 'utf8');
    if (!SEGMENT.test(signaturePart) || !verifySignature('RSA-SHA256', signed, publicKey, Buffer.from(signaturePart, 'base64url'))) {
      throw new Error('Bad signature.');
    }

    if (typeof payload.iss !== 'string' || !GOOGLE_ISSUERS.has(payload.iss)) throw new Error('Bad issuer.');
    const audience = payload.aud;
    const audienceOk = Array.isArray(audience) ? audience.includes(clientId) : audience === clientId;
    if (!audienceOk) throw new Error('Bad audience.');
    if (typeof payload.exp !== 'number' || payload.exp * 1000 <= nowMs - CLOCK_LEEWAY_MS) throw new Error('Expired.');
    if (typeof payload.iat !== 'number' || payload.iat > nowMs / 1000 + FUTURE_IAT_LIMIT_S) throw new Error('Issued in the future.');
    if (payload.email_verified !== true) throw new Error('Email not verified.');
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) throw new Error('Missing subject.');
    if (typeof payload.email !== 'string' || payload.email.trim().length === 0) throw new Error('Missing email.');

    return {
      sub: payload.sub,
      email: payload.email.trim().toLowerCase(),
      name: typeof payload.name === 'string' ? payload.name : null,
    };
  } catch {
    throw unauthorized(FAILED_MESSAGE);
  }
}
