import { Router } from 'express';
import { createAdminController } from '../controllers/admin.controller';
import type { Services } from '../services';

/** Every route here is admin-only; the auth middleware enforces that for user accounts. */
export function createAdminRouter(services: Services): Router {
  const router = Router();
  const ctrl = createAdminController(services);
  router.get('/admin/users', ctrl.listUsers);
  router.post('/admin/users', ctrl.createUser);
  router.patch('/admin/users/:id', ctrl.updateUser);
  router.post('/admin/users/:id/reset-password', ctrl.resetPassword);
  router.delete('/admin/users/:id', ctrl.deleteUser);
  router.get('/admin/config', ctrl.getConfig);
  router.put('/admin/config', ctrl.updateConfig);
  router.get('/admin/usage', ctrl.usage);
  return router;
}
