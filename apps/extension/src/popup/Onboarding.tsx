import { LogIn } from 'lucide-react';
import { useState } from 'react';
import { openDashboard } from '../components/navigation';
import { Button } from '../components/ui/Button';
import { LogoMark } from '../components/Logo';

const STEPS = [
  { title: 'Click Sign in with Verba website', body: 'Sign in or create an account (email or Google). The extension connects automatically.' },
  { title: 'Done', body: 'Come back here and start translating.' },
] as const;

/** Shown when the extension is not connected to a Verba account yet. */
export function Onboarding({ onConnect }: { onConnect: () => void }) {
  const [error, setError] = useState<string | null>(null);

  /** Opens the website sign-in page; it links this extension back automatically. */
  async function signInWithWebsite() {
    setError(null);
    const res = await openDashboard(`/extension/connect?ext=${chrome.runtime.id}`);
    if (res.ok) {
      window.close();
    } else {
      setError(res.error.message);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-card">
        <div aria-hidden className="absolute -right-10 -top-12 h-36 w-36 rounded-full bg-brand-gradient opacity-20 blur-2xl" />
        <div className="relative flex items-center gap-3">
          <LogoMark size={40} />
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold">Sign in to Verba</h2>
            <p className="text-[12.5px] leading-5 text-muted">
              Translate, fix and rewrite text with AI, one shortcut away on any page.
            </p>
          </div>
        </div>
      </div>

      <ol className="space-y-2">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-3 rounded-xl border border-border bg-surface p-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[12px] font-semibold text-brand">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-medium">{step.title}</p>
              <p className="text-[12px] leading-5 text-muted">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <Button fullWidth icon={LogIn} onClick={() => void signInWithWebsite()}>
        Sign in with Verba website
      </Button>

      {error && <p className="text-center text-[12.5px] text-danger">{error}</p>}

      <p className="text-center text-[12.5px]">
        <Button variant="ghost" size="sm" onClick={onConnect} className="text-brand hover:text-brand">
          Sign in with email instead
        </Button>
      </p>
    </div>
  );
}
