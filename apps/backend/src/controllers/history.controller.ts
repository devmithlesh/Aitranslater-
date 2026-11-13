import { historyFavoriteSchema, historyQuerySchema } from '../schemas';
import { LOCAL_USER_ID } from '../middleware/auth';
import { parseOrThrow } from '../middleware/validate';
import type { Services } from '../services';
import { notFound } from '../utils/errors';
import { asyncHandler } from '../utils/request';

export function createHistoryController(services: Services) {
  return {
    list: asyncHandler(async (req, res) => {
      const query = parseOrThrow(historyQuerySchema, req.query);
      res.json(await services.history.list(LOCAL_USER_ID, query));
    }),

    setFavorite: asyncHandler(async (req, res) => {
      const { favorite } = parseOrThrow(historyFavoriteSchema, req.body);
      const item = await services.history.setFavorite(LOCAL_USER_ID, req.params.id, favorite);
      if (!item) throw notFound('History item not found.');
      res.json(item);
    }),

    remove: asyncHandler(async (req, res) => {
      const removed = await services.history.remove(LOCAL_USER_ID, req.params.id);
      if (!removed) throw notFound('History item not found.');
      res.status(204).end();
    }),

    clear: asyncHandler(async (_req, res) => {
      res.json({ deleted: await services.history.clear(LOCAL_USER_ID) });
    }),
  };
}
