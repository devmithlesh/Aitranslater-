import { Router } from 'express';
import { createMeController, createSystemController } from '../controllers/system.controller';
import type { Services } from '../services';

export function createAuthRouter(storage: 'file' | 'supabase', services: Services): Router {
  const router = Router();
  router.get('/auth/verify', createSystemController(storage).verify);
  router.get('/me', createMeController(services).me);
  return router;
}
