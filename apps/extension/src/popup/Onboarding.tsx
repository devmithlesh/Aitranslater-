import { Plug } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { LogoMark } from '../components/Logo';
import { DEFAULT_DASHBOARD_URL } from '../shared/messages';

const STEPS = [
  { title: 'Sign in with email', body: 'Open Verba settings and sign in with your email and password.' },
  { title: 'Or use a code', body: 'Signed in with Google? On the website, open Account → Connect extension, then paste the code in Settings.' },
] as const;

/** Shown when the extension is not connected to a Verba account yet. */
export function Onboarding({ onConnect }: { onConnect: () => void }) {
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

      <Button fullWidth icon={Plug} onClick={onConnect}>
        Open settings to sign in
      </Button>

      <p className="text-center text-[12.5px] text-muted">
        No account?{' '}
        <a
          href={`${DEFAULT_DASHBOARD_URL}/signup`}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-brand hover:underline"
        >
          Create one
        </a>
      </p>
    </div>
  );
}
