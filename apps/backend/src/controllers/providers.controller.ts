import { isProviderId } from '@verba/shared';
import { providerUpdateSchema } from '../schemas';
import { LOCAL_USER_ID } from '../middleware/auth';
import { parseOrThrow } from '../middleware/validate';
import type { Services } from '../services';
import { notFound } from '../utils/errors';
import { asyncHandler } from '../utils/request';

function requireProviderId(id: string): void {
  if (!isProviderId(id)) throw notFound(`Unknown provider "${id}".`);
}

export function createProvidersController(services: Services) {
  return {
    list: asyncHandler(async (_req, res) => {
      res.json({ items: await services.registry.list(LOCAL_USER_ID) });
    }),

    update: asyncHandler(async (req, res) => {
      requireProviderId(req.params.id);
      const patch = parseOrThrow(providerUpdateSchema, req.body);
      res.json(await services.registry.update(LOCAL_USER_ID, req.params.id, patch));
    }),

    test: asyncHandler(async (req, res) => {
      requireProviderId(req.params.id);
      res.json(await services.registry.test(LOCAL_USER_ID, req.params.id));
    }),
  };
}
