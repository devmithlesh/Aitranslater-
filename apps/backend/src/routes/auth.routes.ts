import { Router } from 'express';
import type { RequestHandler } from 'express';
import { createAuthController } from '../controllers/auth.controller';
import { createMeController } from '../controllers/system.controller';
import type { Services } from '../services';

/**
 * Public auth routes, mounted BEFORE the auth middleware. Sign-in routes share the stricter limiter.
 */
export function createPublicAuthRouter(services: Services, authLimiter: RequestHandler): Router {
  const router = Router();
  const ctrl = createAuthController(services);
  router.get('/auth/config', ctrl.config);
  router.post('/auth/signup', authLimiter, ctrl.signup);
  router.post('/auth/login', authLimiter, ctrl.login);
  router.post('/auth/google', authLimiter, ctrl.google);
  return router;
}

/** Signed-in auth routes, mounted AFTER the auth middleware. */
export function createAuthRouter(services: Services): Router {
  const router = Router();
  const ctrl = createAuthController(services);
  const me = createMeController(services);
  router.get('/auth/verify', me.verify);
  router.get('/me', me.me);
  router.post('/auth/logout', ctrl.logout);
  router.post('/auth/change-password', ctrl.changePassword);
  router.post('/auth/sessions', ctrl.newSession);
  return router;
}
