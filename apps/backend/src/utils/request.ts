import type { Request, RequestHandler, Response } from 'express';

/** Forwards rejected promises from async handlers to the Express error handler. */
export function asyncHandler(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}

/** Aborts in-flight provider calls when the client disconnects before the response ends. */
export function requestSignal(res: Response): AbortSignal {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) controller.abort();
  });
  return controller.signal;
}
