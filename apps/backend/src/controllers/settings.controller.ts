import { settingsUpdateSchema } from '../schemas';
import { getAuth } from '../middleware/auth';
import { parseOrThrow } from '../middleware/validate';
import type { Services } from '../services';
import { asyncHandler } from '../utils/request';

/** Settings belong to the caller: the admin's or a user's own. */
export function createSettingsController(services: Services) {
  return {
    get: asyncHandler(async (_req, res) => {
      res.json(await services.settings.get(getAuth(res).userId));
    }),

    update: asyncHandler(async (req, res) => {
      const patch = parseOrThrow(settingsUpdateSchema, req.body);
      res.json(await services.settings.update(getAuth(res).userId, patch));
    }),
  };
}
