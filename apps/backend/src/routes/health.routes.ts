import { Router } from 'express';
import { createSystemController } from '../controllers/system.controller';

/** Public: no token required. */
export function createHealthRouter(storage: 'file' | 'supabase'): Router {
  const router = Router();
  router.get('/health', createSystemController(storage).health);
  return router;
}
