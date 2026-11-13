import { UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button, Card, CardHeader, ErrorState, Field, Input, useToast } from '@/components/ui';
import { useAppSelector } from '@/store';
import { useCreateUserMutation } from '@/store/api';
import { buildConnectionCode, isLocalServerUrl, type RevealedCode } from './connectionCode';
import { LimitInput } from './LimitInput';
import { parseLimitInput } from './limits';

const NAME_MAX = 60;

export interface AddUserFormProps {
  onCreated: (revealed: RevealedCode) => void;
  onCancel: () => void;
}

/** Inline (expandable) form to add a user. The token it returns is turned into a code and handed up once. */
export function AddUserForm({ onCreated, onCancel }: AddUserFormProps) {
  const toast = useToast();
  const apiUrl = useAppSelector((s) => s.connection.apiUrl);
  const [createUser, { isLoading, reset }] = useCreateUserMutation();
  const [userName, setUserName] = useState('');
  const [limit, setLimit] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [limitError, setLimitError] = useState<string | null>(null);
  const [formError, setFormError] = useState<unknown>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading) return;

    const trimmed = userName.trim();
    const nameMessage = trimmed === '' ? 'Enter a name.' : trimmed.length > NAME_MAX ? `Use ${NAME_MAX} characters or fewer.` : null;
    const parsed = parseLimitInput(limit);
    setNameError(nameMessage);
    setLimitError(parsed.ok ? null : parsed.error);
    setFormError(null);
    if (nameMessage || !parsed.ok) return;

    try {
      const result = await createUser({ name: trimmed, dailyLimit: parsed.value }).unwrap();
      // Drop the token from RTK Query's mutation cache right away; only the code is kept, in component state.
      reset();
      onCreated({
        name: result.user.name,
        code: buildConnectionCode(apiUrl, result.token),
        local: isLocalServerUrl(apiUrl),
      });
      toast.success('User added', `Copy the connection code for ${result.user.name} now.`);
    } catch (err) {
      setFormError(err);
    }
  }

  return (
    <Card className="animate-slide-up">
      <CardHeader icon={<UserPlus size={17} aria-hidden />} title="Add a user" description="You will get a connection code to send them. It is shown only once." />
      <form onSubmit={submit} noValidate className="space-y-5 p-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Name" error={nameError} hint={`Up to ${NAME_MAX} characters.`}>
            {(id) => (
              <Input
                id={id}
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="e.g. Sara"
                autoComplete="off"
                autoFocus
                invalid={!!nameError}
              />
            )}
          </Field>
          <LimitInput
            label="Daily limit"
            value={limit}
            onChange={setLimit}
            error={limitError}
            hint="Translations per day. Leave empty to follow the default limit."
            placeholder="Follow default"
          />
        </div>

        {formError !== null && <ErrorState compact error={formError} />}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" icon={UserPlus} loading={isLoading}>
            Create user
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
