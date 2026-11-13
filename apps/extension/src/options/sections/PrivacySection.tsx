import { ExternalLink, KeyRound, MousePointerClick, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { openDashboard } from '../../components/navigation';
import { Button } from '../../components/ui/Button';
import { Notice, SectionCard } from './SectionCard';

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
    title: 'History is yours to control',
    body: 'You can turn history off or clear it in the dashboard at any time.',
  },
  {
    icon: KeyRound,
    title: 'Your access token stays on this device',
    body: 'The access token is stored in extension storage on this device. Only the background worker reads it.',
  },
] as const;

export function PrivacySection() {
  const [openError, setOpenError] = useState(false);

  async function openHistorySettings() {
    setOpenError(false);
    const res = await openDashboard('/settings/general');
    if (!res.ok) setOpenError(true);
  }

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

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-[12.5px] text-muted">Manage history and retention in the dashboard.</p>
        <Button variant="outline" size="sm" icon={ExternalLink} onClick={() => void openHistorySettings()}>
          Open history settings
        </Button>
      </div>
      {openError && <Notice tone="error">Could not open the dashboard. Try again.</Notice>}
    </SectionCard>
  );
}
