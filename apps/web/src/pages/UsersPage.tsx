import { Users, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui';
import { AddUserForm } from '@/features/admin/AddUserForm';
import { DefaultLimitCard } from '@/features/admin/DefaultLimitCard';
import { SignupsCard } from '@/features/admin/SignupsCard';
import { TemporaryPasswordReveal, type RevealedPassword } from '@/features/admin/TemporaryPasswordReveal';
import { UserRow } from '@/features/admin/UserRow';
import { useUsersQuery } from '@/store/api';
import { formatNumber } from '@/utils/format';

export default function UsersPage() {
  const users = useUsersQuery();
  const [adding, setAdding] = useState(false);
  const [revealed, setRevealed] = useState<RevealedPassword | null>(null);

  let list;
  if (users.isError && !users.data) {
    list = <ErrorState error={users.error} onRetry={() => void users.refetch()} />;
  } else if (!users.data) {
    list = (
      <div className="space-y-3" aria-busy aria-label="Loading users">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="space-y-3 p-5">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </Card>
        ))}
      </div>
    );
  } else if (users.data.length === 0) {
    list = (
      <Card>
        <EmptyState icon={Users} title="No users yet — add one to share your Verba server." />
      </Card>
    );
  } else {
    list = (
      <Card>
        <ul className="divide-y divide-border">
          {users.data.map((user) => (
            <UserRow key={user.id} user={user} onRevealed={setRevealed} />
          ))}
        </ul>
      </Card>
    );
  }

  return (
    <div className="animate-slide-up">
      <PageHeader
        title="Users"
        description="Create accounts with a temporary password, manage plans and limits, and reset passwords."
        icon={<Users size={20} aria-hidden />}
        actions={
          <Button
            variant={adding ? 'outline' : 'primary'}
            icon={UserPlus}
            aria-expanded={adding}
            onClick={() => setAdding((open) => !open)}
          >
            {adding ? 'Close' : 'Add user'}
          </Button>
        }
      />

      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SignupsCard />
          <DefaultLimitCard />
        </div>

        {revealed && <TemporaryPasswordReveal {...revealed} onDismiss={() => setRevealed(null)} />}

        {adding && (
          <AddUserForm
            onCreated={(next) => {
              setRevealed(next);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        )}

        <section aria-labelledby="users-heading" className="space-y-3">
          <h2 id="users-heading" className="text-[16px] font-semibold tracking-tight text-fg">
            Everyone
            {users.data && users.data.length > 0 && (
              <span className="ml-2 text-[13px] font-normal tabular-nums text-muted">{formatNumber(users.data.length)}</span>
            )}
          </h2>
          {list}
        </section>
      </div>
    </div>
  );
}
