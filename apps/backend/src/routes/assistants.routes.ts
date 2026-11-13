import { Router } from 'express';
import { createAssistantsController } from '../controllers/assistants.controller';
import type { Services } from '../services';

export function createAssistantsRouter(services: Services): Router {
  const router = Router();
  const ctrl = createAssistantsController(services);
  router.get('/assistants', ctrl.list);
  router.post('/assistants', ctrl.create);
  router.put('/assistants/:id', ctrl.update);
  router.delete('/assistants/:id', ctrl.remove);
  return router;
}
