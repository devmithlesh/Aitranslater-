import { Router } from 'express';
import { createProvidersController } from '../controllers/providers.controller';
import type { Services } from '../services';

export function createProvidersRouter(services: Services): Router {
  const router = Router();
  const ctrl = createProvidersController(services);
  router.get('/providers', ctrl.list);
  router.put('/providers/:id', ctrl.update);
  router.post('/providers/:id/test', ctrl.test);
  return router;
}
