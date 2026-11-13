import { Router } from 'express';
import { createExtensionController } from '../controllers/extension.controller';
import type { Services } from '../services';

export function createExtensionRouter(services: Services): Router {
  const router = Router();
  const ctrl = createExtensionController(services);
  router.post('/extension/heartbeat', ctrl.heartbeat);
  router.get('/extension/status', ctrl.status);
  return router;
}
