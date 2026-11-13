import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors';
import { isRecord } from '../utils/json';

function send(res: Response, status: number, code: string, message: string, details?: unknown): void {
  res.status(status).json({ error: { code, message, ...(details === undefined ? {} : { details }) } });
}

/** Body-parser errors carry a `type` such as "entity.too.large" and a 4xx status. */
function isBodyParserError(err: unknown): err is { type: string; status: number } {
  return isRecord(err) && typeof err.type === 'string' && typeof err.status === 'number';
}

export const notFoundHandler: RequestHandler = (req, res) => {
  send(res, 404, 'NOT_FOUND', `No API route for ${req.method} ${req.path}.`);
};

/** Maps every error to the contract error shape. Unknown errors are logged server-side only. */
export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof AppError) {
    send(res, err.status, err.code, err.message, err.details);
    return;
  }
  if (err instanceof ZodError) {
    send(res, 400, 'VALIDATION_ERROR', 'The request is invalid.', err.issues);
    return;
  }
  if (isBodyParserError(err)) {
    if (err.type === 'entity.too.large') {
      send(res, 413, 'PAYLOAD_TOO_LARGE', 'The request body is too large (64 KB max).');
    } else {
      send(res, 400, 'VALIDATION_ERROR', 'The request body is not valid JSON.');
    }
    return;
  }
  console.error('[verba] unhandled error:', err instanceof Error ? (err.stack ?? err.message) : 'unknown error');
  send(res, 500, 'INTERNAL', 'Something went wrong on the server. Check the server log.');
}
