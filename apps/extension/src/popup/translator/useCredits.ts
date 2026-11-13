import type { CreditStatus, MeResponse } from '@verba/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { callApi } from '../../shared/messages';

export interface CreditsState {
  /** Today's credits, or null while unknown or when GET /me is unavailable (older server, network). */
  credits: CreditStatus | null;
  /** Re-reads GET /me. Resolves with the fresh credits (null when unavailable). */
  refresh: () => Promise<CreditStatus | null>;
}

/** The signed-in user's daily translation credits, read from GET /me. Failures hide the line silently. */
export function useCredits(): CreditsState {
  const [credits, setCredits] = useState<CreditStatus | null>(null);
  /** Latest request id. Responses to older requests do not overwrite newer state. */
  const latest = useRef(0);

  const refresh = useCallback(async (): Promise<CreditStatus | null> => {
    const seq = ++latest.current;
    const res = await callApi<MeResponse>('GET', '/me');
    const next = res.ok && res.data && typeof res.data.credits === 'object' ? res.data.credits : null;
    if (seq === latest.current) setCredits(next);
    return next;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { credits, refresh };
}
