import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { LogoMark } from '../../components/Logo';
import { openDashboard } from '../../components/navigation';
import { Button } from '../../components/ui/Button';
import { Notice, SectionCard } from './SectionCard';

export function AboutSection() {
  const [openError, setOpenError] = useState(false);
  const version = chrome.runtime.getManifest().version;

  async function openDashboardHome() {
    setOpenError(false);
    const res = await openDashboard();
    if (!res.ok) setOpenError(true);
  }

  return (
    <SectionCard id="about" title="About">
      <div className="flex items-center gap-4">
        <LogoMark size={44} />
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">Verba</p>
          <p className="text-[12.5px] text-muted">Version {version}</p>
          <p className="mt-0.5 text-[12.5px] text-muted">Your AI writing and translation assistant.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-[12.5px] text-muted">Your account and providers live in the dashboard.</p>
        <Button variant="outline" size="sm" icon={ExternalLink} onClick={() => void openDashboardHome()}>
          Open dashboard
        </Button>
      </div>
      {openError && <Notice tone="error">Could not open the dashboard. Try again.</Notice>}
    </SectionCard>
  );
}
