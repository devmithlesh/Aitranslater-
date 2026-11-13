import type { Request } from 'express';
import { CLIENT_HEADER } from '@verba/shared';
import type { ClientKind } from '@verba/shared';

/** Attributes activity to the dashboard or the extension. Anything unrecognized counts as web. */
export function getClientKind(req: Request): ClientKind {
  const value = req.headers[CLIENT_HEADER.toLowerCase()];
  return value === 'extension' ? 'extension' : 'web';
}
