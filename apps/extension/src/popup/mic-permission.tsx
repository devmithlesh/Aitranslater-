import '@fontsource-variable/inter';
import '../styles/pages.css';
import { Mic } from 'lucide-react';
import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LogoMark } from '../components/Logo';
import { Button } from '../components/ui/Button';

type Status = 'asking' | 'granted' | 'denied';

/**
 * Chrome cannot show the microphone prompt inside the toolbar popup, so voice input asks here, in a
 * normal tab. Access is remembered for the extension: after "Allow", the mic button works in the popup.
 */
function MicPermission() {
  const [status, setStatus] = useState<Status>('asking');

  const ask = useCallback(async () => {
    setStatus('asking');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Only the permission is wanted, not a recording.
      stream.getTracks().forEach((track) => track.stop());
      setStatus('granted');
    } catch {
      setStatus('denied');
    }
  }, []);

  useEffect(() => {
    void ask();
  }, [ask]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <LogoMark size={40} />
      <h1 className="text-lg font-semibold">Microphone for Verba</h1>
      {status === 'asking' && <p className="text-sm text-muted">Choose “Allow” in the browser prompt at the top of this page.</p>}
      {status === 'granted' && (
        <p role="status" className="text-sm text-muted">
          Done. Microphone access is on. Close this tab, open Verba again and tap the mic.
        </p>
      )}
      {status === 'denied' && (
        <>
          <p role="alert" className="text-sm text-danger">
            Access was blocked. Click the lock icon in the address bar, set Microphone to Allow, then try again.
          </p>
          <Button icon={Mic} onClick={() => void ask()}>
            Try again
          </Button>
        </>
      )}
    </main>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('Verba mic page: missing #root element');
createRoot(container).render(
  <StrictMode>
    <MicPermission />
  </StrictMode>,
);
