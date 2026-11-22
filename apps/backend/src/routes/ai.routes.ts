import express, { Router } from 'express';
import type { RequestHandler } from 'express';
import { createAiController } from '../controllers/ai.controller';
import type { Services } from '../services';

/** Room for up to three shrunk screenshots (base64) plus the question. */
const WRITE_BODY_LIMIT = '12mb';

/** AI routes take the stricter per-minute budget; the limiter is attached per route, not per router. */
export function createAiRouter(services: Services, aiLimiter: RequestHandler): Router {
  const router = Router();
  const ctrl = createAiController(services);
  router.get('/guest/credits', ctrl.guestCredits);
  router.post('/translate', aiLimiter, ctrl.translate);
  router.post('/explain', aiLimiter, ctrl.explain);
  router.post('/translate-variants', aiLimiter, ctrl.translateVariants);
  router.post('/write', aiLimiter, express.json({ limit: WRITE_BODY_LIMIT }), ctrl.write);
  router.post('/reply-variants', aiLimiter, ctrl.replyVariants);
  return router;
}
