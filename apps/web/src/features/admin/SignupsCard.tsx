import { UserPlus } from 'lucide-react';
import { Card, CardHeader, ErrorState, Skeleton, Switch, useToast } from '@/components/ui';
import { errorMessage, useAdminConfigQuery, useUpdateAdminConfigMutation } from '@/store/api';

/** Lets the admin open or close self-service sign-up on the login and signup pages. */
export function SignupsCard() {
  const toast = useToast();
  const config = useAdminConfigQuery();
  const [updateConfig, { isLoading: saving }] = useUpdateAdminConfigMutation();

  if (!config.data) {
    if (config.isError) {
      return <ErrorState error={config.error} onRetry={() => void config.refetch()} />;
    }
    return (
      <Card className="space-y-3 p-5" aria-busy aria-label="Loading sign-up setting">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-6 w-full max-w-xs rounded-xl" />
      </Card>
    );
  }

  const open = config.data.signupsEnabled;

  async function toggle(next: boolean) {
    try {
      await updateConfig({ signupsEnabled: next }).unwrap();
      toast.success(next ? 'New signups are open' : 'New signups are closed');
    } catch (err) {
      toast.error('Could not change sign-up setting', errorMessage(err));
    }
  }

  return (
    <Card>
      <CardHeader
        icon={<UserPlus size={17} aria-hidden />}
        title="New signups"
        description="When off, people cannot create their own accounts. You can still add users here."
      />
      <div className="p-5">
        <Switch
          checked={open}
          disabled={saving}
          onChange={(next) => void toggle(next)}
          label={open ? 'Anyone can create an account' : 'Sign-up is closed'}
          description="Applies to email sign-up and Google sign-in."
        />
      </div>
    </Card>
  );
}
