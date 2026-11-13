import { LOCAL_USER_ID } from '../middleware/auth';
import type { Services } from '../services';
import { asyncHandler } from '../utils/request';

export function createStatsController(services: Services) {
  return {
    stats: asyncHandler(async (_req, res) => {
      res.json(await services.stats.stats(LOCAL_USER_ID));
    }),

    usage: asyncHandler(async (_req, res) => {
      res.json({ items: await services.stats.providerUsage(LOCAL_USER_ID) });
    }),
  };
}
