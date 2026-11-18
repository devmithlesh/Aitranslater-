import type { UserView } from '@verba/shared';
import { Trash2, UserPlus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Skeleton, useToast } from '@/components/ui';
import { AddUserForm } from '@/features/admin/AddUserForm';
import { TemporaryPasswordReveal, type RevealedPassword } from '@/features/admin/TemporaryPasswordReveal';
import { errorMessage, useDeleteUserMutation, useUsersQuery } from '@/store/api';
import { formatNumber, formatRelative } from '@/utils/format';

/** Heaviest users first: today, then this month. */
function byUsage(a: UserView, b: UserView): number {
  return b.usedToday - a.usedToday || b.usedThisMonth - a.usedThisMonth;
}

export default function UsersPage() {
  const users = useUsersQuery();
  const [removeUser, { isLoading: deleting }] = useDeleteUserMutation();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [revealed, setRevealed] = useState<RevealedPassword | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const rows = useMemo(() => (users.data ? [...users.data].sort(byUsage) : []), [users.data]);

  async function deleteUser(user: UserView) {
    try {
      await removeUser(user.id).unwrap();
      setConfirmingId(null);
      toast.success(`${user.name} deleted`);
    } catch (err) {
      setConfirmingId(null);
      toast.error(`Could not delete ${user.name}`, errorMessage(err));
    }
  }

  let content;
  if (users.isError && !users.data) {
    content = <ErrorState error={users.error} onRetry={() => void users.refetch()} />;
  } else if (!users.data) {
    content = (
      <div className="space-y-3" aria-busy aria-label="Loading users">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="space-y-3 p-5">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </Card>
        ))}
      </div>
    );
  } else if (rows.length === 0) {
    content = (
      <Card>
        <EmptyState icon={Users} title="No users yet — add one to share your Verba server." />
      </Card>
    );
  } else {
    content = (
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-[14px]">
          <thead className="border-b border-border text-[12.5px] text-subtle">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                User
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Today
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                This month
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Last used
              </th>
              <th scope="col" className="px-4 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((user) => {
              const isAdmin = user.role === 'admin';
              const confirming = confirmingId === user.id;
              return (
                <tr key={user.id} className="align-middle">
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="break-words font-semibold text-fg">{user.name}</span>
                      {isAdmin && <Badge tone="brand">Admin</Badge>}
                      {user.disabled && (
                        <Badge tone="danger" dot>
                          Disabled
                        </Badge>
                      )}
                    </div>
                    <div className="break-all text-[13px] text-muted">{user.email}</div>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-fg">
                    {formatNumber(user.usedToday)}
                    {user.effectiveLimit !== null && (
                      <span className="text-muted"> / {formatNumber(user.effectiveLimit)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-fg">{formatNumber(user.usedThisMonth)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{formatRelative(user.lastUsedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    {isAdmin ? (
                      <span className="text-muted" aria-label="No actions for admins">
                        —
                      </span>
                    ) : confirming ? (
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="danger" size="sm" loading={deleting} onClick={() => void deleteUser(user)}>
                          Confirm
                        </Button>
                        <Button variant="ghost" size="sm" disabled={deleting} onClick={() => setConfirmingId(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Trash2}
                        className="text-danger hover:text-danger"
                        disabled={deleting}
                        onClick={() => setConfirmingId(user.id)}
                      >
                        Delete
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    );
  }

  return (
    <div className="animate-slide-up">
      <PageHeader
        title="Users"
        description="Everyone with a Verba account and how much they use it."
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
            {rows.length > 0 && (
              <span className="ml-2 text-[13px] font-normal tabular-nums text-muted">{formatNumber(rows.length)}</span>
            )}
          </h2>
          {content}
        </section>
      </div>
    </div>
  );
}
