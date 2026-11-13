import { timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import type { UserRole } from '@verba/shared';
import type { Storage } from '../storage/types';
import { sha256, sha256Hex } from '../utils/crypto';
import { forbidden, unauthorized } from '../utils/errors';

/** The admin ("local") is the server's own token. Every other account is a stored user. */
export const LOCAL_USER_ID = 'local';
export const ADMIN_NAME = 'Admin';

/** Who the request is acting as. Set by the auth middleware on `res.locals.auth`. */
export interface AuthContext {
  userId: string;
  role: UserRole;
  name: string;
}

export interface AuthDeps {
  adminToken: string;
  storage: Storage;
}

interface UserRoute {
  method: string;
  path: string;
}

/** Routes a non-admin account may call (paths relative to /api). Everything else is admin-only. */
const USER_ROUTES: readonly UserRoute[] = [
  { method: 'GET', path: '/auth/verify' },
  { method: 'GET', path: '/me' },
  { method: 'POST', path: '/translate-variants' },
  { method: 'GET', path: '/settings' },
  { method: 'PUT', path: '/settings' },
  { method: 'GET', path: '/assistants' },
  { method: 'POST', path: '/extension/heartbeat' },
];

/** Exact match on method and path. Anything not listed (including unknown routes) is denied to users. */
export function isUserRoute(method: string, path: string): boolean {
  const normalizedPath = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  const verb = method === 'HEAD' ? 'GET' : method;
  return USER_ROUTES.some((route) => route.method === verb && route.path === normalizedPath);
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
 * Resolves `Authorization: Bearer <token>` to the admin or a stored user. The admin token is compared
 * as SHA-256 digests in constant time; user tokens are looked up by their stored digest.
 */
export function createAuthMiddleware({ adminToken, storage }: AuthDeps): RequestHandler {
  const adminDigest = sha256(adminToken);

  async function resolve(req: Request): Promise<AuthContext> {
    const token = bearerToken(req);
    if (!token) throw unauthorized();

    if (timingSafeEqual(sha256(token), adminDigest)) {
      return { userId: LOCAL_USER_ID, role: 'admin', name: ADMIN_NAME };
    }

    const user = await storage.findUserByTokenHash(sha256Hex(token));
    if (!user) throw unauthorized();
    if (user.disabled) throw forbidden('This account is disabled. Ask the admin to enable it.');
    return { userId: user.id, role: 'user', name: user.name };
  }

  return (req, res, next) => {
    void resolve(req).then(
      (auth) => {
        if (auth.role === 'user' && !isUserRoute(req.method, req.path)) {
          next(forbidden('Only the admin can do that.'));
          return;
        }
        res.locals.auth = auth;
        next();
      },
      (err: unknown) => next(err),
    );
  };
}
