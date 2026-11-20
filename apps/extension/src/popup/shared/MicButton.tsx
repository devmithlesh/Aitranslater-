import { ExternalLink, Mic, Square } from 'lucide-react';
import { cn } from '../../components/ui/cn';
import { SPEECH_MESSAGES, type SpeechInput } from './speech';

export interface MicButtonProps {
  speech: SpeechInput;
  /** Text already in the box. Speech is added after it. */
  getBase: () => string;
  disabled?: boolean;
}

/** Round mic button. Pulses red while listening; tap again to stop. */
export function MicButton({ speech, getBase, disabled }: MicButtonProps) {
  if (!speech.supported) return null;
  const label = speech.listening ? 'Stop listening' : 'Speak instead of typing';
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={speech.listening}
      disabled={disabled}
      onClick={() => speech.toggle(getBase())}
      className={cn(
        'relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors',
        'disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
        speech.listening
          ? 'border-danger/40 bg-danger-soft text-danger'
          : 'border-border bg-surface text-muted shadow-card hover:border-border-strong hover:text-fg',
      )}
    >
      {speech.listening && <span aria-hidden className="absolute inset-0 animate-ping rounded-[10px] bg-danger/20" />}
      {speech.listening ? <Square size={14} fill="currentColor" aria-hidden /> : <Mic size={16} aria-hidden />}
    </button>
  );
}

/** Opens the page that asks Chrome for microphone access. The popup itself cannot show that prompt. */
function openMicPermissionPage(): void {
  void chrome.tabs.create({ url: chrome.runtime.getURL('mic-permission.html') }).catch(() => undefined);
}

/** Live status under the input: "Listening…" or what went wrong, with a fix for the permission case. */
export function SpeechNotice({ speech }: { speech: SpeechInput }) {
  if (speech.listening) {
    return (
      <p role="status" className="flex items-center gap-1.5 text-[11.5px] text-danger">
        <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" />
        Listening… tap the square to stop.
      </p>
    );
  }
  if (!speech.problem) return null;
  return (
    <div role="alert" className="space-y-1.5 text-[11.5px] text-danger">
      <p>{SPEECH_MESSAGES[speech.problem]}</p>
      {speech.problem === 'permission' && (
        <button
          type="button"
          onClick={openMicPermissionPage}
          className="inline-flex items-center gap-1 rounded-md font-medium text-brand underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <ExternalLink size={12} aria-hidden /> Allow microphone (opens a tab)
        </button>
      )}
    </div>
  );
}
