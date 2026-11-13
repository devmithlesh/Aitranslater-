import { randomUUID } from 'node:crypto';
import { SESSION_DAYS } from '@verba/shared';
import type { Storage, StoredSession } from '../storage/types';
import { generateAccessToken, sha256Hex } from '../utils/crypto';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface IssuedSession {
  /** The bearer token. Shown to the caller once; only its digest is stored. */
  token: string;
  expiresAt: string;
  session: StoredSession;
}

/** Server-side login sessions. Tokens are opaque and revocable; the store only holds their SHA-256. */
export class SessionsService {
  constructor(
    private readonly storage: Storage,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Mints a session for a user. Also drops expired sessions, so the store does not grow forever. */
  async create(userId: string): Promise<IssuedSession> {
    const now = this.now();
    await this.storage.pruneExpiredSessions(now.toISOString());
    const token = generateAccessToken();
    const session: StoredSession = {
      id: randomUUID(),
      userId,
      tokenHash: sha256Hex(token),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + SESSION_DAYS * DAY_MS).toISOString(),
    };
    await this.storage.saveSession(session);
    return { token, expiresAt: session.expiresAt, session };
  }

  /** The live session for a token, or undefined. An expired session is deleted on the way. */
  async findActive(token: string): Promise<StoredSession | undefined> {
    const session = await this.storage.findSessionByTokenHash(sha256Hex(token));
    if (!session) return undefined;
    if (Date.parse(session.expiresAt) <= this.now().getTime()) {
      await this.storage.deleteSession(session.id);
      return undefined;
    }
    return session;
  }

  revoke(sessionId: string): Promise<void> {
    return this.storage.deleteSession(sessionId);
  }

  /** Drops sessions that expired before now. Called at boot. */
  prune(): Promise<number> {
    return this.storage.pruneExpiredSessions(this.now().toISOString());
  }
}
