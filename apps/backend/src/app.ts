import cors from 'cors';
import type { CorsOptions } from 'cors';
import express from 'express';
import type { Express } from 'express';
import helmet from 'helmet';
import { CLIENT_HEADER } from '@verba/shared';
import type { AppConfig } from './config/env';
import { createAuthMiddleware } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { createRateLimiters } from './middleware/rate-limit';
import { createAdminRouter } from './routes/admin.routes';
import { createAiRouter } from './routes/ai.routes';
import { createAssistantsRouter } from './routes/assistants.routes';
import { createAuthRouter, createPublicAuthRouter } from './routes/auth.routes';
import { createFeedbackRouter } from './routes/feedback.routes';
import { createExtensionRouter } from './routes/extension.routes';
import { createHealthRouter } from './routes/health.routes';
import { createHistoryRouter } from './routes/history.routes';
import { createProvidersRouter } from './routes/providers.routes';
import { createSettingsRouter } from './routes/settings.routes';
import { createStatsRouter } from './routes/stats.routes';
import { createServices } from './services';
import type { Storage } from './storage/types';

export interface AppDeps {
  config: AppConfig;
  storage: Storage;
  accessToken: string;
  encryptionKey: Buffer;
  /** Clock for day boundaries (credits, usage). Tests inject a fixed one. */
  now?: () => Date;
}

const EXTENSION_PREFIX = 'chrome-extension://';

/** Requests without an Origin (curl, server-to-server) are allowed; browsers are checked against the lists. */
export function isOriginAllowed(origin: string | undefined, config: AppConfig): boolean {
  if (!origin) return true;
  if (config.corsOrigins.includes(origin)) return true;
  if (!origin.startsWith(EXTENSION_PREFIX)) return false;
  if (!config.allowExtensionOrigins) return false;
  if (!config.extensionIds) return true;
  const id = origin.slice(EXTENSION_PREFIX.length).replace(/\/+$/, '');
  return config.extensionIds.includes(id);
}

function corsOptions(config: AppConfig): CorsOptions {
  return {
    origin: (origin, callback) => callback(null, isOriginAllowed(origin, config)),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', CLIENT_HEADER],
  };
}

export function createApp(deps: AppDeps): Express {
  const { config, storage } = deps;
  const services = createServices(config, storage, deps.encryptionKey, deps.now);
  const limiters = createRateLimiters(config);

  const app = express();
  app.disable('x-powered-by');
  // Trust exactly ONE proxy hop (the host's load balancer, e.g. Render). `true` would trust every
  // X-Forwarded-For entry, letting clients spoof their IP and bypass the per-IP (login) rate limits.
  app.set('trust proxy', config.trustProxy ? 1 : false);
  // Cross-origin must be allowed so the dashboard and extension can read responses.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors(corsOptions(config)));
  // Everything is small JSON, except /api/write, which may carry pictures: it gets a larger parser after login.
  const smallJson = express.json({ limit: '64kb' });
  app.use((req, res, next) => (req.path === '/api/write' ? next() : smallJson(req, res, next)));

  const api = express.Router();
  api.use(limiters.general);
  api.use(createHealthRouter(storage.kind));
  api.use(createPublicAuthRouter(services, limiters.auth));
  api.use(createAuthMiddleware({ adminToken: deps.accessToken, storage, now: deps.now }));
  api.use(createAuthRouter(services));
  api.use(createAdminRouter(services));
  api.use(createAiRouter(services, limiters.ai));
  api.use(createFeedbackRouter(services, limiters.feedback));
  api.use(createAssistantsRouter(services));
  api.use(createHistoryRouter(services));
  api.use(createSettingsRouter(services));
  api.use(createProvidersRouter(services));
  api.use(createStatsRouter(services));
  api.use(createExtensionRouter(services));
  api.use(notFoundHandler);

  app.use('/api', api);
  app.use(errorHandler);
  return app;
}
