import { Router } from 'express';
import type { RequestHandler } from 'express';
import { createFeedbackController } from '../controllers/feedback.controller';
import type { Services } from '../services';

/** Feedback has its own small per-minute budget so nobody can flood the table or use up the AI budget. */
export function createFeedbackRouter(services: Services, limiter: RequestHandler): Router {
  const router = Router();
  const ctrl = createFeedbackController(services);
  router.post('/feedback', limiter, ctrl.create);
  return router;
}
