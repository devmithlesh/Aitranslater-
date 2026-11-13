import type { RequestHandler } from 'express';
import type { HealthResponse } from '@verba/shared';
import { getAuth } from '../middleware/auth';
import type { Services } from '../services';
import { asyncHandler } from '../utils/request';

const APP_VERSION = '0.1.0';

export function createSystemController(storage: 'file' | 'supabase') {
  const health: RequestHandler = (_req, res) => {
    const body: HealthResponse = {
      status: 'ok',
      name: 'verba',
      version: APP_VERSION,
      storage,
      time: new Date().toISOString(),
    };
    res.json(body);
  };

  return { health };
}

/** The caller's own identity (GET /auth/verify) and profile with credits (GET /me). */
export function createMeController(services: Services) {
  return {
    verify: asyncHandler(async (_req, res) => {
      res.json({ ok: true, ...services.auth.profile(getAuth(res)) });
    }),

    me: asyncHandler(async (_req, res) => {
      res.json(await services.auth.me(getAuth(res)));
    }),
  };
}
