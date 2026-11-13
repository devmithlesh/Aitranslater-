import { changePasswordSchema, googleLoginSchema, loginSchema, signupSchema } from '../schemas';
import { getAuth } from '../middleware/auth';
import { parseOrThrow } from '../middleware/validate';
import type { Services } from '../services';
import { asyncHandler } from '../utils/request';

/** Sign-up, sign-in, sessions and password routes. Public ones are mounted before the auth middleware. */
export function createAuthController(services: Services) {
  return {
    config: asyncHandler(async (_req, res) => {
      res.json(await services.auth.authConfig());
    }),

    signup: asyncHandler(async (req, res) => {
      const input = parseOrThrow(signupSchema, req.body);
      res.status(201).json(await services.auth.signup(input));
    }),

    login: asyncHandler(async (req, res) => {
      const input = parseOrThrow(loginSchema, req.body);
      res.json(await services.auth.login(input));
    }),

    google: asyncHandler(async (req, res) => {
      const input = parseOrThrow(googleLoginSchema, req.body);
      res.json(await services.auth.google(input.idToken));
    }),

    logout: asyncHandler(async (_req, res) => {
      await services.auth.logout(getAuth(res));
      res.status(204).end();
    }),

    changePassword: asyncHandler(async (req, res) => {
      const input = parseOrThrow(changePasswordSchema, req.body);
      await services.auth.changePassword(getAuth(res), input);
      res.status(204).end();
    }),

    newSession: asyncHandler(async (_req, res) => {
      res.status(201).json(await services.auth.newSession(getAuth(res)));
    }),
  };
}
