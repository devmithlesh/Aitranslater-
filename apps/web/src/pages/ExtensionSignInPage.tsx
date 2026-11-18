import { CheckCircle2, Puzzle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, CardHeader, ErrorState, PageHeader, Spinner } from '@/components/ui';
import { isExtensionId, sendToExtension } from '@/features/extension/extensionBridge';
import { useAppSelector } from '@/store';
import { errorMessage, useCreateSessionMutation } from '@/store/api';

type Phase = { kind: 'working' } | { kind: 'success' } | { kind: 'error'; message: string };

const OPEN_FROM_EXTENSION = "Open this page from the Verba extension (click 'Sign in with Verba website').";

/**
 * Signs the Chrome extension in with a fresh session made for it, so the extension and the website
 * stay signed in together. Reached from the extension with `?ext=<extensionId>`.
 */
export default function ExtensionSignInPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ext = params.get('ext');
  const validExt = isExtensionId(ext) ? ext : null;
  const apiUrl = useAppSelector((s) => s.connection.apiUrl);
  const [createSession, { reset }] = useCreateSessionMutation();
  const [phase, setPhase] = useState<Phase>({ kind: 'working' });
  // Records which extension ID the flow already ran for, so StrictMode's double effect does not run it twice.
  const startedFor = useRef<string | null>(null);

  const run = useCallback(
    async (extId: string) => {
      setPhase({ kind: 'working' });

      const ping = await sendToExtension<{ connected: boolean }>(extId, { type: 'verba:web-ping' });
      if (!ping.ok) {
        setPhase({ kind: 'error', message: ping.message });
        return;
      }

      let token: string;
      try {
        const session = await createSession().unwrap();
        token = session.token;
        // Keep the token out of the RTK Query cache; it is only handed to the extension below.
        reset();
      } catch (err) {
        setPhase({ kind: 'error', message: errorMessage(err) });
        return;
      }

      const connect = await sendToExtension<{ connected: true }>(extId, {
        type: 'verba:web-connect',
        apiUrl,
        token,
      });
      setPhase(connect.ok ? { kind: 'success' } : { kind: 'error', message: connect.message });
    },
    [apiUrl, createSession, reset],
  );

  useEffect(() => {
    if (!validExt || startedFor.current === validExt) return;
    startedFor.current = validExt;
    void run(validExt);
  }, [validExt, run]);

  return (
    <div className="mx-auto w-full max-w-2xl animate-slide-up">
      <PageHeader
        title="Connect extension"
        description="Sign the Verba Chrome extension in with this website account."
        icon={<Puzzle size={20} aria-hidden />}
      />

      <Card>
        <CardHeader title="Verba extension" />
        <div className="space-y-5 p-5">
          {!validExt && <ErrorState error={{ message: OPEN_FROM_EXTENSION }} />}

          {validExt && phase.kind === 'working' && (
            <div className="flex items-center gap-3 text-[14px] text-muted">
              <Spinner size={18} className="text-brand" />
              <span>Connecting the Verba extension…</span>
            </div>
          )}

          {validExt && phase.kind === 'success' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-success" aria-hidden />
                <div className="space-y-1">
                  <h2 className="text-[16px] font-semibold text-fg">Extension connected</h2>
                  <p className="text-[13.5px] text-muted">
                    You're signed in on the website and in the Verba extension. You can close this tab and start
                    translating.
                  </p>
                </div>
              </div>
              <Button variant="secondary" onClick={() => navigate('/')}>
                Go to dashboard
              </Button>
            </div>
          )}

          {validExt && phase.kind === 'error' && (
            <div className="space-y-4">
              <ErrorState compact error={{ message: phase.message }} />
              <Button variant="outline" onClick={() => void run(validExt)}>
                Try again
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
