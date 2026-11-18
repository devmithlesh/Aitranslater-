import { AlertTriangle, Puzzle } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, CardHeader, CopyButton, ErrorState, PageHeader } from '@/components/ui';
import { buildConnectionCode, isLocalServerUrl } from '@/features/admin/connectionCode';
import { useAppSelector } from '@/store';
import { errorMessage, useCreateSessionMutation } from '@/store/api';

const STEPS = [
  'Click "Create extension code" below.',
  'Open the Verba extension and go to Settings.',
  'Paste the code into "Connect to Verba" and save.',
];

/** Gives the Chrome extension its own session, shown as a connection code once. */
export default function ConnectExtensionPage() {
  const apiUrl = useAppSelector((s) => s.connection.apiUrl);
  const [createSession, { isLoading, reset }] = useCreateSessionMutation();
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (isLoading) return;
    setError(null);
    try {
      const session = await createSession().unwrap();
      // Keep the token out of the RTK Query cache; only the code lives in this page's state.
      reset();
      setCode(buildConnectionCode(apiUrl, session.token));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl animate-slide-up">
      <PageHeader
        title="Connect Chrome extension"
        description="Easiest: in the extension click 'Sign in with Verba website'. Or create a code here and paste it into the extension's settings (needed for self-hosted servers)."
        icon={<Puzzle size={20} aria-hidden />}
      />

      <Card>
        <CardHeader
          title="Connection code"
          description="The code is shown only once. Create a new one at any time."
          actions={
            <Button onClick={() => void generate()} loading={isLoading} variant={code ? 'outline' : 'primary'}>
              {code ? 'Create new code' : 'Create extension code'}
            </Button>
          }
        />
        <div className="space-y-5 p-5">
          {error && <ErrorState compact error={{ message: error }} />}

          {code ? (
            <>
              {isLocalServerUrl(apiUrl) && (
                <p role="alert" className="flex items-start gap-2 rounded-xl border border-warning/20 bg-warning-soft p-3 text-[12.5px] text-fg">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden />
                  <span className="min-w-0">This code points to localhost. It only works on this computer.</span>
                </p>
              )}
              <code className="block break-all rounded-xl border border-border bg-surface-2 p-3 font-mono text-[12.5px] leading-relaxed text-fg">
                {code}
              </code>
              <CopyButton text={code} label="Copy code" size="md" variant="secondary" />
            </>
          ) : (
            <p className="text-[13.5px] text-muted">No code yet.</p>
          )}

          <ol className="list-decimal space-y-2 pl-5 text-[13.5px] text-muted marker:text-subtle">
            {STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      </Card>
    </div>
  );
}
