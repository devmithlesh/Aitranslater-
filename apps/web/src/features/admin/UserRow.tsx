import type { UserView } from '@verba/shared';
import { Ban, Pencil, Power, RefreshCw, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Badge, Button, useToast } from '@/components/ui';
import { useAppSelector } from '@/store';
import {
  errorMessage,
  useDeleteUserMutation,
  useRegenerateUserTokenMutation,
  useUpdateUserMutation,
} from '@/store/api';
import { formatNumber, formatRelative } from '@/utils/format';
import { buildConnectionCode, isLocalServerUrl, type RevealedCode } from './connectionCode';
import { LimitInput } from './LimitInput';
import { limitToInput, parseLimitInput } from './limits';

type Confirm = 'delete' | 'regenerate' | null;

export interface UserRowProps {
  user: UserView;
  onRevealed: (revealed: RevealedCode) => void;
}

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-2 px-3 py-2">
      <dt className="text-[11.5px] text-subtle">{label}</dt>
      <dd className="mt-0.5 break-words text-[14px] font-semibold tabular-nums text-fg">{children}</dd>
    </div>
  );
}

/** One user: usage figures, limit override, and the account actions (regenerate, disable, delete). */
export function UserRow({ user, onRevealed }: UserRowProps) {
  const toast = useToast();
  const apiUrl = useAppSelector((s) => s.connection.apiUrl);
  const [updateUser, { isLoading: updating }] = useUpdateUserMutation();
  const [regenerate, { isLoading: regenerating, reset: resetRegenerate }] = useRegenerateUserTokenMutation();
  const [removeUser, { isLoading: deleting }] = useDeleteUserMutation();

  const [confirm, setConfirm] = useState<Confirm>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);

  const busy = updating || regenerating || deleting;
  const limitLabel = user.effectiveLimit === null ? 'Unlimited' : `${formatNumber(user.effectiveLimit)} per day`;
  const limitSource = user.dailyLimit === null ? 'default' : 'own limit';
  const todayLabel =
    user.effectiveLimit === null
      ? formatNumber(user.usedToday)
      : `${formatNumber(user.usedToday)} of ${formatNumber(user.effectiveLimit)}`;

  function startEditing() {
    setDraft(limitToInput(user.dailyLimit));
    setDraftError(null);
    setEditing(true);
  }

  async function saveLimit(dailyLimit: number | null) {
    try {
      await updateUser({ id: user.id, patch: { dailyLimit } }).unwrap();
      setEditing(false);
      toast.success(`${user.name}'s limit updated`);
    } catch (err) {
      setDraftError(errorMessage(err));
    }
  }

  function submitLimit() {
    const parsed = parseLimitInput(draft);
    if (!parsed.ok) {
      setDraftError(parsed.error);
      return;
    }
    setDraftError(null);
    void saveLimit(parsed.value);
  }

  async function toggleDisabled() {
    try {
      await updateUser({ id: user.id, patch: { disabled: !user.disabled } }).unwrap();
      toast.success(`${user.name} ${user.disabled ? 'enabled' : 'disabled'}`);
    } catch (err) {
      toast.error(`Could not update ${user.name}`, errorMessage(err));
    }
  }

  async function regenerateCode() {
    try {
      const result = await regenerate(user.id).unwrap();
      // Keep the token out of the RTK Query cache; the code lives only in the page's reveal state.
      resetRegenerate();
      setConfirm(null);
      onRevealed({
        name: result.user.name,
        code: buildConnectionCode(apiUrl, result.token),
        local: isLocalServerUrl(apiUrl),
      });
    } catch (err) {
      toast.error(`Could not regenerate ${user.name}'s code`, errorMessage(err));
      setConfirm(null);
    }
  }

  async function deleteUser() {
    try {
      await removeUser(user.id).unwrap();
      toast.success(`${user.name} deleted`);
    } catch (err) {
      toast.error(`Could not delete ${user.name}`, errorMessage(err));
      setConfirm(null);
    }
  }

  return (
    <li className="min-w-0 space-y-4 p-4 sm:p-5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h3 className="min-w-0 break-words text-[15px] font-semibold text-fg">{user.name}</h3>
        {user.disabled && (
          <Badge tone="danger" dot>
            Disabled
          </Badge>
        )}
        <Badge tone="neutral">
          {limitLabel} · {limitSource}
        </Badge>
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Figure label="Today">{todayLabel}</Figure>
        <Figure label="This month">{formatNumber(user.usedThisMonth)}</Figure>
        <Figure label="All time">{formatNumber(user.totalUsed)}</Figure>
        <Figure label="Last used">{formatRelative(user.lastUsedAt)}</Figure>
      </dl>

      {editing && (
        <form
          className="flex flex-col gap-3 rounded-xl border border-border bg-surface-2/50 p-3.5 sm:flex-row sm:items-end"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) submitLimit();
          }}
        >
          <LimitInput
            label={`${user.name}'s daily limit`}
            value={draft}
            onChange={setDraft}
            error={draftError}
            hint="Empty = follow the default limit."
            placeholder="Follow default"
            className="w-full sm:max-w-xs"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" loading={updating}>
              Save limit
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void saveLimit(null)}>
              Use default
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {confirm === 'regenerate' ? (
          <>
            <span className="min-w-0 text-[12.5px] text-muted">The old code stops working.</span>
            <Button variant="danger" size="sm" icon={RefreshCw} loading={regenerating} onClick={() => void regenerateCode()}>
              Confirm regenerate
            </Button>
            <Button variant="ghost" size="sm" disabled={regenerating} onClick={() => setConfirm(null)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" icon={RefreshCw} disabled={busy} onClick={() => setConfirm('regenerate')}>
            Regenerate code
          </Button>
        )}

        {!editing && (
          <Button variant="outline" size="sm" icon={Pencil} disabled={busy} onClick={startEditing}>
            Edit limit
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          icon={user.disabled ? Power : Ban}
          loading={updating && !editing}
          disabled={busy}
          onClick={() => void toggleDisabled()}
        >
          {user.disabled ? 'Enable' : 'Disable'}
        </Button>

        {confirm === 'delete' ? (
          <>
            <Button variant="danger" size="sm" icon={Trash2} loading={deleting} onClick={() => void deleteUser()}>
              Confirm delete
            </Button>
            <Button variant="ghost" size="sm" disabled={deleting} onClick={() => setConfirm(null)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            icon={Trash2}
            className="text-danger hover:text-danger"
            disabled={busy}
            onClick={() => setConfirm('delete')}
          >
            Delete
          </Button>
        )}
      </div>
    </li>
  );
}
