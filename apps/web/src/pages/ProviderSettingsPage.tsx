import { getProviderDescriptor, type ProviderId, type ProviderView } from '@verba/shared';
import { KeyRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Card, ErrorState, PageHeader, Skeleton, useToast } from '@/components/ui';
import { ProviderCard } from '@/features/settings/ProviderCard';
import { ProviderExplainer, QuickStartCallout } from '@/features/settings/ProviderExplainer';
import { errorMessage, useProvidersQuery, useUpdateProviderMutation } from '@/store/api';

/** Sorted by priority (lowest first) so the list reads as the fallback order. */
function byPriority(a: ProviderView, b: ProviderView): number {
  return a.priority - b.priority;
}

/** New priorities for a swap. Equal priorities are nudged apart so the order actually changes. */
function swapPriorities(self: ProviderView, other: ProviderView, direction: -1 | 1): { self: number; other: number } {
  if (self.priority === other.priority) return { self: self.priority + direction, other: other.priority };
  return { self: other.priority, other: self.priority };
}

export default function ProviderSettingsPage() {
  const toast = useToast();
  const providers = useProvidersQuery();
  const [updateProvider] = useUpdateProviderMutation();
  const [movingId, setMovingId] = useState<ProviderId | null>(null);

  const groups = useMemo(() => {
    const list = providers.data;
    if (!list) return null;
    return {
      translation: list.filter((p) => p.kind === 'translation').sort(byPriority),
      llm: list.filter((p) => p.kind === 'llm').sort(byPriority),
    };
  }, [providers.data]);

  const hasReadyAi = groups?.llm.some((p) => p.ready) ?? false;

  async function move(provider: ProviderView, siblings: ProviderView[], direction: -1 | 1) {
    const index = siblings.findIndex((p) => p.id === provider.id);
    const other = siblings[index + direction];
    if (!other) return;
    const next = swapPriorities(provider, other, direction);
    setMovingId(provider.id);
    try {
      await updateProvider({ id: provider.id, patch: { priority: next.self } }).unwrap();
      await updateProvider({ id: other.id, patch: { priority: next.other } }).unwrap();
    } catch (err) {
      toast.error('Could not change the order', errorMessage(err));
    } finally {
      setMovingId(null);
    }
  }

  return (
    <div className="animate-slide-up">
      <PageHeader
        title="API Providers"
        description="Choose which services answer, in what order, and store their keys."
        icon={<KeyRound size={20} aria-hidden />}
      />

      <div className="space-y-8">
        <ProviderExplainer />
        {groups && !hasReadyAi && <QuickStartCallout />}

        {providers.isError && !providers.data ? (
          <ErrorState error={providers.error} onRetry={() => void providers.refetch()} />
        ) : !groups ? (
          <div className="space-y-4" aria-busy aria-label="Loading providers">
            {[0, 1, 2].map((i) => (
              <Card key={i} className="space-y-3 p-5">
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-9 w-full rounded-xl" />
              </Card>
            ))}
          </div>
        ) : (
          <>
            <ProviderSection
              title="Translation"
              description="Handles plain translation. Tried in priority order."
              providers={groups.translation}
              movingId={movingId}
              onMove={move}
            />
            <ProviderSection
              title="AI models"
              description="Powers grammar, rewrite, summaries, smart reply and the assistant."
              providers={groups.llm}
              movingId={movingId}
              onMove={move}
            />
          </>
        )}
      </div>
    </div>
  );
}

function ProviderSection({
  title,
  description,
  providers,
  movingId,
  onMove,
}: {
  title: string;
  description: string;
  providers: ProviderView[];
  movingId: ProviderId | null;
  onMove: (provider: ProviderView, siblings: ProviderView[], direction: -1 | 1) => void;
}) {
  const headingId = `section-${title.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <div>
        <h2 id={headingId} className="text-[16px] font-semibold tracking-tight text-fg">
          {title}
        </h2>
        <p className="text-[13px] text-muted">{description}</p>
      </div>
      <div className="space-y-4">
        {providers.map((p, i) => (
          <ProviderCard
            key={p.id}
            provider={p}
            descriptor={getProviderDescriptor(p.id)}
            canMoveUp={i > 0}
            canMoveDown={i < providers.length - 1}
            moving={movingId === p.id}
            onMove={(direction) => onMove(p, providers, direction)}
          />
        ))}
      </div>
    </section>
  );
}
