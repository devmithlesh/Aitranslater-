import type { Request, RequestHandler, Response } from 'express';
import rateLimit from 'express-rate-limit';
import type { AppConfig } from '../config/env';

const WINDOW_MS = 60_000;
const AUTH_WINDOW_MS = 15 * 60_000;

/**
 * Keyed by client IP (express-rate-limit's default, honouring TRUST_PROXY through req.ip). The token is
 * not used because it is unverified before auth runs, so rotating bogus tokens would get fresh budgets.
 */
function limiter(limit: number, windowMs: number = WINDOW_MS): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req: Request, res: Response) => {
      res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many requests. Wait a moment and try again.' },
      });
    },
  });
}

export interface RateLimiters {
  general: RequestHandler;
  ai: RequestHandler;
  /** Sign-in and sign-up routes. Stricter, over a 15-minute window. */
  auth: RequestHandler;
}

export function createRateLimiters(config: AppConfig): RateLimiters {
  return {
    general: limiter(config.rateLimitPerMinute),
    ai: limiter(config.rateLimitAiPerMinute),
    auth: limiter(config.rateLimitAuthPer15Min, AUTH_WINDOW_MS),
  };
}
