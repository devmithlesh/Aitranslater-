import type { ProviderDescriptor, ProviderView } from '@verba/shared';
import { ArrowDown, ArrowUp, ChevronDown, Info, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, IconButton, Switch, useToast } from '@/components/ui';
import { errorMessage, useUpdateProviderMutation } from '@/store/api';
import { cn } from '@/utils/cn';
import { ProviderConfigForm } from './ProviderConfigForm';
import { ProviderUsage } from './ProviderUsage';

export interface ProviderCardProps {
  provider: ProviderView;
  descriptor: ProviderDescriptor;
  canMoveUp: boolean;
  canMoveDown: boolean;
  moving: boolean;
  onMove: (direction: -1 | 1) => void;
}

export function ProviderCard({ provider, descriptor, canMoveUp, canMoveDown, moving, onMove }: ProviderCardProps) {
  const toast = useToast();
  const [updateProvider, { isLoading: toggling }] = useUpdateProviderMutation();
  // Open by default when the provider needs attention.
  const [open, setOpen] = useState(() => !provider.ready && descriptor.requiresApiKey);

  async function toggleEnabled(enabled: boolean) {
    try {
      await updateProvider({ id: provider.id, patch: { enabled } }).unwrap();
      toast.success(`${descriptor.name} ${enabled ? 'enabled' : 'disabled'}`);
    } catch (err) {
      toast.error(`Could not update ${descriptor.name}`, errorMessage(err));
    }
  }

  const panelId = `provider-panel-${provider.id}`;

  return (
    <Card className={cn('overflow-hidden transition-shadow duration-200 hover:shadow-pop', !provider.enabled && 'opacity-80')}>
      <div className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[15px] font-semibold text-fg">{descriptor.name}</h3>
              {provider.ready ? (
                <Badge tone="success" dot>Ready</Badge>
              ) : (
                <Badge tone="warning" dot>{provider.notReadyReason ?? 'Not ready'}</Badge>
              )}
              {descriptor.selfHosted && <Badge tone="neutral">Self-hosted</Badge>}
              {provider.apiKeySource === 'env' && <Badge tone="brand">Key from env</Badge>}
            </div>
            <p className="text-[13px] leading-relaxed text-muted">{descriptor.description}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-border pt-4">
          <div className="w-56 max-w-full">
            <Switch label="Enabled" checked={provider.enabled} disabled={toggling} onChange={toggleEnabled} />
          </div>
          <div className="flex items-center gap-1.5 text-[12.5px] text-muted" aria-label={`Priority ${provider.priority}`}>
            <span className="tabular-nums">Priority {provider.priority}</span>
            <IconButton
              icon={ArrowUp}
              size="sm"
              label={`Move ${descriptor.name} up in priority`}
              disabled={!canMoveUp || moving}
              onClick={() => onMove(-1)}
            />
            <IconButton
              icon={ArrowDown}
              size="sm"
              label={`Move ${descriptor.name} down in priority`}
              disabled={!canMoveDown || moving}
              onClick={() => onMove(1)}
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon={Settings2}
            iconRight={ChevronDown}
            aria-expanded={open}
            aria-controls={panelId}
            className="ml-auto"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? 'Hide details' : 'Configure'}
          </Button>
        </div>
      </div>

      {open && (
        <div id={panelId} className="space-y-6 border-t border-border bg-surface-2/40 p-5 animate-fade-in">
          <section aria-label="Configuration" className="space-y-4">
            <h4 className="text-[12px] font-semibold uppercase tracking-wider text-subtle">Configuration</h4>
            <ProviderConfigForm provider={provider} descriptor={descriptor} />
          </section>

          <section aria-label="Usage" className="space-y-3">
            <h4 className="text-[12px] font-semibold uppercase tracking-wider text-subtle">Usage</h4>
            <ProviderUsage provider={provider} />
          </section>

          <div className="flex items-start gap-2.5 rounded-xl border border-border bg-surface p-3.5 text-[12.5px] leading-relaxed text-muted">
            <Info size={14} className="mt-0.5 shrink-0 text-subtle" aria-hidden />
            <div className="min-w-0 space-y-1">
              <p>
                <span className="font-medium text-fg">Free tier:</span> {descriptor.freeTier}
              </p>
              <p className="text-subtle">Limits change. Verify them on the provider&apos;s site.</p>
              {descriptor.docsUrl && (
                <a
                  href={descriptor.docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block font-medium text-brand underline-offset-4 hover:underline"
                >
                  Pricing and limits
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
