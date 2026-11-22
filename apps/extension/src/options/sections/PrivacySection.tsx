import { KeyRound, MousePointerClick, ShieldCheck, Trash2 } from 'lucide-react';
import { SectionCard } from './SectionCard';

const POINTS = [
  {
    icon: MousePointerClick,
    title: 'Only what you act on is sent',
    body: 'Verba sends selected text only when you click an action. Nothing is sent automatically or in the background.',
  },
  {
    icon: ShieldCheck,
    title: 'Routed through your server',
    body: 'Text goes to your Verba server, which forwards it to the AI or translation provider you configured.',
  },
  {
    icon: ShieldCheck,
    title: 'Password fields are ignored',
    body: 'Verba never reads or sends the contents of password inputs.',
  },
  {
    icon: Trash2,
    title: 'No history is kept',
    body: 'Verba does not save the text you translate or the answers you get. Only simple usage counts are kept.',
  },
  {
    icon: KeyRound,
    title: 'Your access token stays on this device',
    body: 'The access token is stored in extension storage on this device. Only the background worker reads it.',
  },
] as const;

export function PrivacySection() {
  return (
    <SectionCard id="privacy" title="Privacy" description="What Verba sends, where it goes, and what stays on this device.">
      <ul className="space-y-4">
        {POINTS.map((point) => (
          <li key={point.title} className="flex gap-3">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <point.icon size={15} strokeWidth={2} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-medium">{point.title}</p>
              <p className="text-[12.5px] leading-5 text-muted">{point.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
