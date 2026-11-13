import { Router } from 'express';
import { createStatsController } from '../controllers/stats.controller';
import type { Services } from '../services';

export function createStatsRouter(services: Services): Router {
  const router = Router();
  const ctrl = createStatsController(services);
  router.get('/stats', ctrl.stats);
  router.get('/usage', ctrl.usage);
  return router;
}
