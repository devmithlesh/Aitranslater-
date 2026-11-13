import { timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import type { UserRole } from '@verba/shared';
import type { Storage, StoredUser } from '../storage/types';
import { SessionsService } from '../services/sessions.service';
import { sha256 } from '../utils/crypto';
import { forbidden, unauthorized } from '../utils/errors';

/** The server's own token acts as "local". Every other caller is a stored account. */
export const LOCAL_USER_ID = 'local';
export const ADMIN_NAME = 'Admin';

/** Who the request is acting as. Set by the auth middleware on `res.locals.auth`. */
export interface AuthContext {
  userId: string;
  role: UserRole;
  name: string;
  /** null for the server token. */
  email: string | null;
  /** The session the request arrived on. null for the server token. */
  sessionId: string | null;
  /** The stored account. null for the server token. */
  user: StoredUser | null;
  /** True when the caller used VERBA_ACCESS_TOKEN rather than a session. */
  serverToken: boolean;
}

export interface AuthDeps {
  adminToken: string;
  storage: Storage;
  now?: () => Date;
}

interface RouteRule {
  method: string;
  path: string;
}

/** Routes a non-admin account may call (paths relative to /api). Everything else is admin-only. */
const USER_ROUTES: readonly RouteRule[] = [
  { method: 'GET', path: '/auth/verify' },
  { method: 'GET', path: '/me' },
  { method: 'POST', path: '/auth/logout' },
  { method: 'POST', path: '/auth/change-password' },
  { method: 'POST', path: '/auth/sessions' },
  { method: 'POST', path: '/translate-variants' },
  { method: 'GET', path: '/settings' },
  { method: 'PUT', path: '/settings' },
  { method: 'GET', path: '/assistants' },
  { method: 'POST', path: '/extension/heartbeat' },
];

/** Routes that still work while an admin reset requires a new password. */
const PASSWORD_CHANGE_EXEMPT: readonly RouteRule[] = [
  { method: 'GET', path: '/auth/verify' },
  { method: 'GET', path: '/me' },
  { method: 'POST', path: '/auth/change-password' },
  { method: 'POST', path: '/auth/logout' },
];

function matchesRule(rules: readonly RouteRule[], method: string, path: string): boolean {
  const normalizedPath = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  const verb = method === 'HEAD' ? 'GET' : method;
  return rules.some((rule) => rule.method === verb && rule.path === normalizedPath);
}

/** Exact match on method and path. Anything not listed (including unknown routes) is denied to users. */
export function isUserRoute(method: string, path: string): boolean {
  return matchesRule(USER_ROUTES, method, path);
}

/** Returns the authenticated caller. Only valid on routes mounted behind the auth middleware. */
export function getAuth(res: Response): AuthContext {
  const auth = res.locals.auth as AuthContext | undefined;
  if (!auth) throw new Error('Route used without the auth middleware.');
  return auth;
}

function bearerToken(req: Request): string {
  const header = req.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
}

/**
 * Resolves `Authorization: Bearer <token>` to the server token or a session. The server token is compared
 * as SHA-256 digests in constant time. Session tokens are looked up by their stored digest.
 */
export function createAuthMiddleware({ adminToken, storage, now = () => new Date() }: AuthDeps): RequestHandler {
  const adminDigest = sha256(adminToken);
  const sessions = new SessionsService(storage, now);

  async function resolve(req: Request): Promise<AuthContext> {
    const token = bearerToken(req);
    if (!token) throw unauthorized();

    if (timingSafeEqual(sha256(token), adminDigest)) {
      return {
        userId: LOCAL_USER_ID,
        role: 'admin',
        name: ADMIN_NAME,
        email: null,
        sessionId: null,
        user: null,
        serverToken: true,
      };
    }

    const session = await sessions.findActive(token);
    if (!session) throw unauthorized();
    const user = await storage.getUser(session.userId);
    if (!user) throw unauthorized();
    if (user.disabled) throw forbidden('This account is disabled.');
    return {
      userId: user.id,
      role: user.role,
      name: user.name,
      email: user.email,
      sessionId: session.id,
      user,
      serverToken: false,
    };
  }

  return (req, res, next) => {
    void resolve(req).then(
      (auth) => {
        if (auth.role === 'user' && !isUserRoute(req.method, req.path)) {
          next(forbidden('Only the admin can do that.'));
          return;
        }
        if (auth.user?.mustChangePassword && !matchesRule(PASSWORD_CHANGE_EXEMPT, req.method, req.path)) {
          next(forbidden('Choose a new password first.'));
          return;
        }
        res.locals.auth = auth;
        next();
      },
      (err: unknown) => next(err),
    );
  };
}
