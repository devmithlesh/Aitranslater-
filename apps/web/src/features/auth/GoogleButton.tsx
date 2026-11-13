import { useEffect, useRef, useState } from 'react';
import { useAppSelector } from '@/store';

const GSI_SRC = 'https://accounts.google.com/gsi/client';

/** Shared across mounts: the script is appended at most once per page. */
let gsiLoad: Promise<boolean> | null = null;

function identityApi(): GoogleAccountsId | undefined {
  return window.google?.accounts.id;
}

/** Resolves true once Google Identity Services is available; false if the script cannot load. */
function loadIdentityScript(): Promise<boolean> {
  if (identityApi()) return Promise.resolve(true);
  if (!gsiLoad) {
    gsiLoad = new Promise<boolean>((resolve) => {
      const script =
        document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`) ?? document.createElement('script');
      if (!script.src) {
        script.src = GSI_SRC;
        script.async = true;
        document.head.appendChild(script);
      }
      script.addEventListener('load', () => resolve(identityApi() !== undefined));
      script.addEventListener('error', () => {
        script.remove();
        gsiLoad = null;
        resolve(false);
      });
    });
  }
  return gsiLoad;
}

/** The app's dark class is set synchronously by applyTheme, before this component re-renders. */
function isDarkNow(): boolean {
  return document.documentElement.classList.contains('dark');
}

export interface GoogleButtonProps {
  clientId: string;
  mode: 'signin' | 'signup';
  /** Receives the Google ID token (credential) to exchange with the server. */
  onCredential: (idToken: string) => void;
}

/**
 * Official "Sign in with Google" button. If the script fails to load, the whole block is hidden
 * so the email form stays the only option.
 */
export function GoogleButton({ clientId, mode, onCredential }: GoogleButtonProps) {
  const theme = useAppSelector((s) => s.ui.theme);
  const buttonRef = useRef<HTMLDivElement>(null);
  const credentialRef = useRef(onCredential);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    credentialRef.current = onCredential;
  }, [onCredential]);

  // Track the container width so the button fills the form on phones.
  useEffect(() => {
    const el = buttonRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadIdentityScript().then((loaded) => {
      if (cancelled) return;
      const api = identityApi();
      if (!loaded || !api) {
        setFailed(true);
        return;
      }
      try {
        api.initialize({
          client_id: clientId,
          callback: ({ credential }) => {
            if (credential) credentialRef.current(credential);
          },
        });
        setReady(true);
      } catch {
        setFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  useEffect(() => {
    const el = buttonRef.current;
    const api = identityApi();
    if (!ready || !el || !api) return;
    el.replaceChildren();
    api.renderButton(el, {
      type: 'standard',
      theme: isDarkNow() ? 'filled_black' : 'outline',
      size: 'large',
      text: mode === 'signup' ? 'signup_with' : 'signin_with',
      shape: 'rectangular',
      logo_alignment: 'left',
      width: Math.min(400, Math.max(200, width || 320)),
    });
  }, [ready, mode, theme, width]);

  return (
    <div hidden={failed} className="space-y-5">
      <div ref={buttonRef} className="flex min-h-11 w-full justify-center" />
      <div className="flex items-center gap-3 text-[12.5px] text-subtle">
        <span aria-hidden className="h-px flex-1 bg-border" />
        <span>or</span>
        <span aria-hidden className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
