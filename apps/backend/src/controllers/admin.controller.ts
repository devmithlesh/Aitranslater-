import { adminConfigUpdateSchema, createUserSchema, updateUserSchema } from '../schemas';
import { getAuth } from '../middleware/auth';
import { parseOrThrow } from '../middleware/validate';
import type { Services } from '../services';
import { asyncHandler } from '../utils/request';

/** Admin-only routes. The role gate in the auth middleware rejects every other caller before these run. */
/** Most messages the admin tab loads at once. */
const FEEDBACK_LIST_LIMIT = 200;

export function createAdminController(services: Services) {
  return {
    listUsers: asyncHandler(async (_req, res) => {
      res.json({ items: await services.users.list() });
    }),

    createUser: asyncHandler(async (req, res) => {
      const input = parseOrThrow(createUserSchema, req.body);
      res.status(201).json(await services.users.create(input));
    }),

    updateUser: asyncHandler(async (req, res) => {
      const patch = parseOrThrow(updateUserSchema, req.body);
      res.json(await services.users.update(req.params.id, patch, getAuth(res)));
    }),

    resetPassword: asyncHandler(async (req, res) => {
      res.json(await services.users.resetPassword(req.params.id, getAuth(res)));
    }),

    deleteUser: asyncHandler(async (req, res) => {
      await services.users.remove(req.params.id, getAuth(res));
      res.status(204).end();
    }),

    getConfig: asyncHandler(async (_req, res) => {
      res.json(await services.admin.getConfig());
    }),

    updateConfig: asyncHandler(async (req, res) => {
      const patch = parseOrThrow(adminConfigUpdateSchema, req.body);
      res.json(await services.admin.updateConfig(patch));
    }),

    usage: asyncHandler(async (_req, res) => {
      res.json(await services.admin.usage());
    }),

    /** What people wrote in the feedback form. Admin only (every /admin route is). */
    feedback: asyncHandler(async (_req, res) => {
      res.json(await services.feedback.list(FEEDBACK_LIST_LIMIT));
    }),
  };
}
