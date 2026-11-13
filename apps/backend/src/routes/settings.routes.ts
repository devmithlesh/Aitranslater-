import { Router } from 'express';
import { createSettingsController } from '../controllers/settings.controller';
import type { Services } from '../services';

export function createSettingsRouter(services: Services): Router {
  const router = Router();
  const ctrl = createSettingsController(services);
  router.get('/settings', ctrl.get);
  router.put('/settings', ctrl.update);
  return router;
}
