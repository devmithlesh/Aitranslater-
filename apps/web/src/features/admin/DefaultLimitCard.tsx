import { Gauge } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, CardHeader, ErrorState, Skeleton, useToast } from '@/components/ui';
import { errorMessage, useAdminConfigQuery, useUpdateAdminConfigMutation } from '@/store/api';
import { formatNumber } from '@/utils/format';
import { LimitInput } from './LimitInput';
import { limitToInput, parseLimitInput } from './limits';

/** Sets the daily limit every user without their own override gets. Empty = unlimited. */
export function DefaultLimitCard() {
  const toast = useToast();
  const config = useAdminConfigQuery();
  const [updateConfig, { isLoading: saving }] = useUpdateAdminConfigMutation();
  // null = the admin has not edited the field, so it shows the saved value.
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!config.data) {
    if (config.isError) {
      return <ErrorState error={config.error} onRetry={() => void config.refetch()} />;
    }
    return (
      <Card className="space-y-3 p-5" aria-busy aria-label="Loading default limit">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-9 w-full max-w-xs rounded-xl" />
      </Card>
    );
  }

  const saved = config.data.defaultDailyLimit;
  const shown = draft ?? limitToInput(saved);
  const dirty = draft !== null && draft.trim() !== limitToInput(saved);

  async function save() {
    const parsed = parseLimitInput(shown);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    try {
      await updateConfig({ defaultDailyLimit: parsed.value }).unwrap();
      setDraft(null);
      toast.success('Default limit saved');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Card>
      <CardHeader
        icon={<Gauge size={17} aria-hidden />}
        title="Default daily limit"
        description="Applies to every user who does not have their own limit. Leave empty for unlimited."
      />
      <form
        className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty && !saving) void save();
        }}
      >
        <LimitInput
          label="Translations per user, per day"
          value={shown}
          onChange={(v) => setDraft(v)}
          error={error}
          hint={saved === null ? 'Currently unlimited.' : `Currently ${formatNumber(saved)} per user per day.`}
          className="w-full sm:max-w-xs"
        />
        <Button type="submit" disabled={!dirty} loading={saving}>
          Save default
        </Button>
      </form>
    </Card>
  );
}
