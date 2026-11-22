import type { AssistantRunRequest } from '@verba/shared';
import {
  assistantRunSchema,
  detectLanguageSchema,
  explainSchema,
  grammarSchema,
  replyVariantsSchema,
  rewriteSchema,
  smartReplySchema,
  summarizeSchema,
  translateSchema,
  translateVariantsSchema,
  writeSchema,
} from '../schemas';
import { LOCAL_USER_ID, getAuth } from '../middleware/auth';
import type { AuthContext } from '../middleware/auth';
import { getClientKind } from '../middleware/client';
import { parseOrThrow } from '../middleware/validate';
import type { Services } from '../services';
import { asyncHandler, requestSignal } from '../utils/request';

export function createAiController(services: Services) {
  /** One credit per successful call. A failed call (or a cancelled one) gives the credit back. */
  async function withCredit<T>(auth: AuthContext, run: () => Promise<T>): Promise<T> {
    const reservation = await services.credits.reserve(auth);
    let result: T;
    try {
      result = await run();
    } catch (err) {
      await services.credits.refund(auth, reservation).catch((refundErr: unknown) => {
        console.warn('[verba] could not refund a credit:', refundErr instanceof Error ? refundErr.message : refundErr);
      });
      throw err;
    }
    await services.credits.markUsed(auth).catch((markErr: unknown) => {
      console.warn('[verba] could not record last use:', markErr instanceof Error ? markErr.message : markErr);
    });
    return result;
  }

  return {
    /** Free prompts left for a visitor without an account. */
    guestCredits: asyncHandler(async (_req, res) => {
      res.json({ credits: await services.credits.status(getAuth(res)) });
    }),

    translate: asyncHandler(async (req, res) => {
      const request = parseOrThrow(translateSchema, req.body);
      const result = await services.translation.translate({
        userId: LOCAL_USER_ID,
        client: getClientKind(req),
        request,
        signal: requestSignal(res),
      });
      res.json(result);
    }),

    detectLanguage: asyncHandler(async (req, res) => {
      const { text } = parseOrThrow(detectLanguageSchema, req.body);
      res.json(await services.translation.detect(LOCAL_USER_ID, text, requestSignal(res)));
    }),

    grammar: asyncHandler(async (req, res) => {
      const request = parseOrThrow(grammarSchema, req.body);
      res.json(
        await services.ai.grammar({ userId: LOCAL_USER_ID, client: getClientKind(req), request, signal: requestSignal(res) }),
      );
    }),

    rewrite: asyncHandler(async (req, res) => {
      const request = parseOrThrow(rewriteSchema, req.body);
      res.json(
        await services.ai.rewrite({ userId: LOCAL_USER_ID, client: getClientKind(req), request, signal: requestSignal(res) }),
      );
    }),

    summarize: asyncHandler(async (req, res) => {
      const request = parseOrThrow(summarizeSchema, req.body);
      res.json(
        await services.ai.summarize({ userId: LOCAL_USER_ID, client: getClientKind(req), request, signal: requestSignal(res) }),
      );
    }),

    explain: asyncHandler(async (req, res) => {
      const request = parseOrThrow(explainSchema, req.body);
      res.json(
        await services.ai.explain({ userId: LOCAL_USER_ID, client: getClientKind(req), request, signal: requestSignal(res) }),
      );
    }),

    smartReply: asyncHandler(async (req, res) => {
      const request = parseOrThrow(smartReplySchema, req.body);
      res.json(
        await services.ai.smartReply({ userId: LOCAL_USER_ID, client: getClientKind(req), request, signal: requestSignal(res) }),
      );
    }),

    translateVariants: asyncHandler(async (req, res) => {
      const request = parseOrThrow(translateVariantsSchema, req.body);
      const auth = getAuth(res);
      res.json(
        await withCredit(auth, () =>
          services.ai.translateVariants({
            userId: auth.userId,
            client: getClientKind(req),
            request,
            signal: requestSignal(res),
          }),
        ),
      );
    }),

    replyVariants: asyncHandler(async (req, res) => {
      const request = parseOrThrow(replyVariantsSchema, req.body);
      const auth = getAuth(res);
      res.json(
        await withCredit(auth, () =>
          services.ai.replyVariants({
            userId: auth.userId,
            client: getClientKind(req),
            request,
            signal: requestSignal(res),
          }),
        ),
      );
    }),

    write: asyncHandler(async (req, res) => {
      const request = parseOrThrow(writeSchema, req.body);
      const auth = getAuth(res);
      res.json(
        await withCredit(auth, () =>
          services.ai.write({ userId: auth.userId, client: getClientKind(req), request, signal: requestSignal(res) }),
        ),
      );
    }),

    assistant: asyncHandler(async (req, res) => {
      const request: AssistantRunRequest = parseOrThrow(assistantRunSchema, req.body);
      res.json(
        await services.ai.runAssistant({ userId: LOCAL_USER_ID, client: getClientKind(req), request, signal: requestSignal(res) }),
      );
    }),
  };
}
