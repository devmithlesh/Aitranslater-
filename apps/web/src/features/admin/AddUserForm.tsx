import { UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button, Card, CardHeader, ErrorState, Field, Input, useToast } from '@/components/ui';
import { checkEmail, checkName } from '@/features/auth/validation';
import { useCreateUserMutation } from '@/store/api';
import type { RevealedPassword } from './TemporaryPasswordReveal';

export interface AddUserFormProps {
  onCreated: (revealed: RevealedPassword) => void;
  onCancel: () => void;
}

/** Inline (expandable) form to add an account. The temporary password it returns is handed up once. */
export function AddUserForm({ onCreated, onCancel }: AddUserFormProps) {
  const toast = useToast();
  const [createUser, { isLoading, reset }] = useCreateUserMutation();
  const [userName, setUserName] = useState('');
  const [email, setEmail] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<unknown>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading) return;

    const nameProblem = checkName(userName);
    const emailProblem = checkEmail(email);
    setNameError(nameProblem);
    setEmailError(emailProblem);
    setFormError(null);
    if (nameProblem || emailProblem) return;

    const trimmedName = userName.trim();
    try {
      const result = await createUser({ name: trimmedName, email: email.trim() }).unwrap();
      // Drop the password from RTK Query's mutation state right away; only component state keeps it.
      reset();
      onCreated({ name: result.user.name, password: result.temporaryPassword });
      toast.success('Account created', `Copy the temporary password for ${result.user.name} now.`);
    } catch (err) {
      setFormError(err);
    }
  }

  return (
    <Card className="animate-slide-up">
      <CardHeader
        icon={<UserPlus size={17} aria-hidden />}
        title="Add a user"
        description="They sign in with this email and the temporary password, which is shown only once."
      />
      <form onSubmit={submit} noValidate className="space-y-5 p-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Name" error={nameError} hint="Up to 60 characters.">
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
          <Field label="Email" error={emailError} hint="Used to sign in.">
            {(id) => (
              <Input
                id={id}
                type="email"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="sara@example.com"
                invalid={!!emailError}
              />
            )}
          </Field>
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
