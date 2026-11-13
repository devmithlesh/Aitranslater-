import { Info, KeyRound, Sparkles } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui';

function ExternalLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="font-medium text-brand underline-offset-4 hover:underline">
      {children}
    </a>
  );
}

export function ProviderExplainer() {
  return (
    <Card>
      <CardHeader icon={<Info size={16} aria-hidden />} title="How providers work" />
      <CardBody className="grid gap-5 text-[13.5px] leading-relaxed text-muted sm:grid-cols-3">
        <div className="space-y-1.5">
          <p className="font-medium text-fg">Fallback order</p>
          <p>Providers are tried by priority, lowest number first. If one fails or is not ready, the next one answers.</p>
        </div>
        <div className="space-y-1.5">
          <p className="font-medium text-fg">What needs an AI model</p>
          <p>Styled translations and every AI tool (grammar, rewrite, summaries, smart reply, assistant) need an AI model provider.</p>
        </div>
        <div className="space-y-1.5">
          <p className="font-medium text-fg">Where keys live</p>
          <p>Keys are encrypted on your server and are never sent back to this browser. You can replace them, not read them.</p>
        </div>
      </CardBody>
    </Card>
  );
}

/** Shown while no AI model provider is ready. */
export function QuickStartCallout() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-brand/25 bg-brand-soft p-5">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand-gradient opacity-20 blur-3xl" />
      <div className="relative flex gap-3.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-brand-fg shadow-glow">
          <Sparkles size={17} aria-hidden />
        </span>
        <div className="min-w-0 space-y-2 text-[13.5px] leading-relaxed text-fg">
          <p className="font-semibold">Fastest free setup</p>
          <p className="text-muted">
            Get a Gemini key at <ExternalLink href="https://aistudio.google.com/apikey">aistudio.google.com/apikey</ExternalLink> or a
            Groq key at <ExternalLink href="https://console.groq.com/keys">console.groq.com/keys</ExternalLink>, then paste it into
            the card below.
          </p>
          <p className="flex items-start gap-2 text-muted">
            <KeyRound size={14} className="mt-1 shrink-0 text-brand" aria-hidden />
            <span>
              Prefer fully local? Install <ExternalLink href="https://ollama.com">Ollama</ExternalLink> and enable it below.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
