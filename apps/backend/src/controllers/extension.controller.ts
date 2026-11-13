import { heartbeatSchema } from '../schemas';
import { LOCAL_USER_ID, getAuth } from '../middleware/auth';
import { parseOrThrow } from '../middleware/validate';
import type { Services } from '../services';
import { asyncHandler } from '../utils/request';

export function createExtensionController(services: Services) {
  return {
    heartbeat: asyncHandler(async (req, res) => {
      const { version } = parseOrThrow(heartbeatSchema, req.body);
      await services.stats.heartbeat(getAuth(res).userId, version);
      res.status(204).end();
    }),

    status: asyncHandler(async (_req, res) => {
      res.json(await services.stats.extensionStatus(LOCAL_USER_ID));
    }),
  };
}
