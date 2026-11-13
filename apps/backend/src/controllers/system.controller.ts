import type { RequestHandler } from 'express';
import type { HealthResponse, MeResponse, VerifyResponse } from '@verba/shared';
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

  const verify: RequestHandler = (_req, res) => {
    const auth = getAuth(res);
    const body: VerifyResponse = { ok: true, userId: auth.userId, role: auth.role, name: auth.name };
    res.json(body);
  };

  return { health, verify };
}

/** The caller's own profile and credits. */
export function createMeController(services: Services) {
  return {
    me: asyncHandler(async (_req, res) => {
      const auth = getAuth(res);
      const body: MeResponse = {
        userId: auth.userId,
        name: auth.name,
        role: auth.role,
        credits: await services.credits.status(auth),
      };
      res.json(body);
    }),
  };
}
