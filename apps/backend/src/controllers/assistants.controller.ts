import { assistantInputSchema, assistantPatchSchema } from '../schemas';
import { LOCAL_USER_ID, getAuth } from '../middleware/auth';
import { parseOrThrow } from '../middleware/validate';
import type { Services } from '../services';
import { asyncHandler } from '../utils/request';

/** List is open to users (own assistants); the other actions stay admin-only and use the admin's account. */
export function createAssistantsController(services: Services) {
  return {
    list: asyncHandler(async (_req, res) => {
      res.json({ items: await services.ai.listAssistants(getAuth(res).userId) });
    }),

    create: asyncHandler(async (req, res) => {
      const input = parseOrThrow(assistantInputSchema, req.body);
      res.status(201).json(await services.ai.createAssistant(LOCAL_USER_ID, input));
    }),

    update: asyncHandler(async (req, res) => {
      const patch = parseOrThrow(assistantPatchSchema, req.body);
      res.json(await services.ai.updateAssistant(LOCAL_USER_ID, req.params.id, patch));
    }),

    remove: asyncHandler(async (req, res) => {
      await services.ai.deleteAssistant(LOCAL_USER_ID, req.params.id);
      res.status(204).end();
    }),
  };
}
