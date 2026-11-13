import { Router } from 'express';
import { createHistoryController } from '../controllers/history.controller';
import type { Services } from '../services';

export function createHistoryRouter(services: Services): Router {
  const router = Router();
  const ctrl = createHistoryController(services);
  router.get('/history', ctrl.list);
  router.patch('/history/:id', ctrl.setFavorite);
  router.delete('/history/:id', ctrl.remove);
  router.delete('/history', ctrl.clear);
  return router;
}
