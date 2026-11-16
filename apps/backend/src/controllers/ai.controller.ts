import type { AssistantRunRequest } from '@verba/shared';
import {
  assistantRunSchema,
  detectLanguageSchema,
  explainSchema,
  grammarSchema,
  rewriteSchema,
  smartReplySchema,
  summarizeSchema,
  translateSchema,
  translateVariantsSchema,
} from '../schemas';
import { LOCAL_USER_ID, getAuth } from '../middleware/auth';
import { getClientKind } from '../middleware/client';
import { parseOrThrow } from '../middleware/validate';
import type { Services } from '../services';
import { asyncHandler, requestSignal } from '../utils/request';

export function createAiController(services: Services) {
  return {
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

    /** One credit per successful call. A failed call (or a cancelled one) gives the credit back. */
    translateVariants: asyncHandler(async (req, res) => {
      const request = parseOrThrow(translateVariantsSchema, req.body);
      const auth = getAuth(res);
      const reservation = await services.credits.reserve(auth);
      let result: Awaited<ReturnType<typeof services.ai.translateVariants>>;
      try {
        result = await services.ai.translateVariants({
          userId: auth.userId,
          client: getClientKind(req),
          request,
          signal: requestSignal(res),
        });
      } catch (err) {
        await services.credits.refund(auth, reservation).catch((refundErr: unknown) => {
          console.warn('[verba] could not refund a credit:', refundErr instanceof Error ? refundErr.message : refundErr);
        });
        throw err;
      }
      await services.credits.markUsed(auth).catch((markErr: unknown) => {
        console.warn('[verba] could not record last use:', markErr instanceof Error ? markErr.message : markErr);
      });
      res.json(result);
    }),

    assistant: asyncHandler(async (req, res) => {
      const request: AssistantRunRequest = parseOrThrow(assistantRunSchema, req.body);
      res.json(
        await services.ai.runAssistant({ userId: LOCAL_USER_ID, client: getClientKind(req), request, signal: requestSignal(res) }),
      );
    }),
  };
}
