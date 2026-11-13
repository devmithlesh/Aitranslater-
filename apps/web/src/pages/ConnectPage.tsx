import { useLocation, useSearchParams } from 'react-router-dom';
import { ConnectBrandPanel } from '@/features/connect/ConnectBrandPanel';
import { ConnectForm } from '@/features/connect/ConnectForm';
import { useAppSelector } from '@/store';

/** Where to go after connecting. Only same-app paths are accepted. */
function readRedirect(state: unknown): { redirectTo: string; unauthorized: boolean } {
  const s = (state ?? {}) as { from?: unknown; reason?: unknown };
  const from = typeof s.from === 'string' && s.from.startsWith('/') && !s.from.startsWith('//') && !s.from.startsWith('/connect');
  return { redirectTo: from ? (s.from as string) : '/', unauthorized: s.reason === 'unauthorized' };
}

export default function ConnectPage() {
  const location = useLocation();
  const [params] = useSearchParams();
  const apiUrl = useAppSelector((s) => s.connection.apiUrl);
  const { redirectTo, unauthorized } = readRedirect(location.state);
  const initialCode = params.get('code');

  return (
    <div className="min-h-screen bg-bg lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <ConnectBrandPanel className="hidden min-h-screen lg:flex" />

      <main className="flex min-h-screen flex-col justify-center px-4 py-10 sm:px-8 lg:px-12">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <img src="/favicon.svg" alt="" className="h-9 w-9 rounded-xl shadow-glow" />
            <span className="text-lg font-semibold tracking-tight text-fg">Verba</span>
          </div>
          <ConnectForm
            key={initialCode ?? 'manual'}
            initialCode={initialCode}
            initialUrl={apiUrl}
            redirectTo={redirectTo}
            unauthorized={unauthorized}
          />
          <p className="mt-6 text-center text-[12.5px] text-subtle">This browser saves your server link and token locally. Disconnect anytime with the logout button in the top bar.</p>
        </div>
      </main>
    </div>
  );
}
