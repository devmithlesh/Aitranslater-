import { FEEDBACK_CATEGORIES, FEEDBACK_MESSAGE_MAX_LENGTH, type FeedbackCategory, type FeedbackRequest } from '@verba/shared';
import { ArrowLeft, CheckCircle2, Send } from 'lucide-react';
import { useId, useRef, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { cn } from '../../components/ui/cn';
import { fieldClass } from '../../components/ui/fieldClass';
import { callApi, type ExtensionError } from '../../shared/messages';

const MIN_LENGTH = 3;

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  idea: 'Idea',
  bug: 'Something broke',
  other: 'Other',
};

export interface FeedbackPanelProps {
  onBack: () => void;
}

/** Free-text feedback saved on the Verba server. Costs no credits. */
export function FeedbackPanel({ onBack }: FeedbackPanelProps) {
  const uid = useId();
  const [category, setCategory] = useState<FeedbackCategory>('idea');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<ExtensionError | null>(null);
  /** Blocks a second submit while one is in flight (state updates are async). */
  const inFlight = useRef(false);

  const trimmed = message.trim();
  const canSend = trimmed.length >= MIN_LENGTH && !sending;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend || inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setError(null);
    const body: FeedbackRequest = { message: trimmed, category };
    const res = await callApi<{ id: string }>('POST', '/feedback', body);
    inFlight.current = false;
    setSending(false);
    if (res.ok) {
      setSent(true);
      setMessage('');
    } else {
      setError(res.error);
    }
  }

  if (sent) {
    return (
      <div role="status" className="flex flex-col items-center gap-3 px-4 py-8 text-center animate-fade-in">
        <CheckCircle2 size={36} className="text-success" aria-hidden />
        <div className="space-y-1">
          <p className="text-[14px] font-semibold text-fg">Thank you!</p>
          <p className="text-[12.5px] text-muted">Your feedback reached the Verba team. It helps us improve.</p>
        </div>
        <Button variant="outline" onClick={onBack}>
          Back to Verba
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="min-w-0 space-y-4 p-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <ArrowLeft size={16} aria-hidden />
        </button>
        <h2 className="text-[14px] font-semibold text-fg">Help us improve Verba</h2>
      </div>

      <p className="text-[12.5px] leading-5 text-muted">
        Tell us what you would like to see, or what did not work. Hindi, English or Hinglish, anything is fine.
      </p>

      <div role="radiogroup" aria-label="Type of feedback" className="flex flex-wrap gap-2">
        {FEEDBACK_CATEGORIES.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={category === value}
            onClick={() => setCategory(value)}
            className={cn(
              'rounded-full border px-3 py-1 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
              category === value
                ? 'border-brand/40 bg-brand-soft text-brand'
                : 'border-border bg-surface text-muted hover:border-border-strong hover:text-fg',
            )}
          >
            {CATEGORY_LABELS[value]}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        <label htmlFor={`${uid}-message`} className="sr-only">
          Your feedback
        </label>
        <textarea
          id={`${uid}-message`}
          value={message}
          rows={6}
          maxLength={FEEDBACK_MESSAGE_MAX_LENGTH}
          autoFocus
          placeholder="What can we do better?"
          onChange={(e) => setMessage(e.target.value)}
          className={cn(fieldClass, 'resize-none leading-5')}
        />
        <div className="text-right text-[10.5px] tabular-nums text-subtle">
          {message.length.toLocaleString()} / {FEEDBACK_MESSAGE_MAX_LENGTH.toLocaleString()}
        </div>
      </div>

      {error && <ErrorMessage error={error} compact />}

      <Button type="submit" icon={Send} fullWidth loading={sending} disabled={!canSend}>
        Send feedback
      </Button>
    </form>
  );
}
