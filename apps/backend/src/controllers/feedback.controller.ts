import { randomUUID } from 'node:crypto';
import type { FeedbackResponse } from '@verba/shared';
import { feedbackSchema } from '../schemas';
import { getAuth } from '../middleware/auth';
import { getClientKind } from '../middleware/client';
import { parseOrThrow } from '../middleware/validate';
import type { Services } from '../services';
import { asyncHandler } from '../utils/request';

export function createFeedbackController(services: Services) {
  return {
    create: asyncHandler(async (req, res) => {
      const { message, category } = parseOrThrow(feedbackSchema, req.body);
      const id = randomUUID();
      await services.feedback.add({
        id,
        userId: getAuth(res).userId,
        category: category ?? 'idea',
        message,
        client: getClientKind(req),
      });
      const body: FeedbackResponse = { id };
      res.status(201).json(body);
    }),
  };
}
