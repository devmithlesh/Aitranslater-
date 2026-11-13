import { KeyRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, EmptyState } from '@/components/ui';

const NO_PROVIDER_MESSAGE = /no ai provider/i;

/** True when no AI model is configured yet, so the page should guide the user to add a key. */
export function isNotConfiguredError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | undefined;
  return e?.code === 'NO_PROVIDER_CONFIGURED' || NO_PROVIDER_MESSAGE.test(e?.message ?? '');
}

/** Call to action shown instead of an error when no AI key has been added. */
export function NotConfiguredCard() {
  const navigate = useNavigate();
  return (
    <Card>
      <EmptyState
        icon={KeyRound}
        title="Add a free AI key to get started"
        description="Gemini (Google AI Studio) and Groq both have free keys."
        action={
          <Button icon={KeyRound} onClick={() => navigate('/settings/providers')}>
            Add an AI key
          </Button>
        }
      />
    </Card>
  );
}
