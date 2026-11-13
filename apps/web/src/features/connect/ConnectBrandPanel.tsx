import { Languages, PenLine, ShieldCheck, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/cn';

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Languages,
    title: 'Type in any language — get English in every tone',
    body: 'Romanized text such as Hinglish is understood too. Several tones come back in one go.',
  },
  {
    icon: PenLine,
    title: 'Works in any text box with the Chrome extension',
    body: 'Translate, fix grammar and draft replies right where you type.',
  },
  {
    icon: ShieldCheck,
    title: 'Free daily translations · Unlimited plan coming soon',
    body: 'Every account gets a daily limit on the free plan.',
  },
];

/** Left-hand brand story on desktop. Decorative only; the form carries the content. */
export function ConnectBrandPanel({ className }: { className?: string }) {
  return (
    <aside
      className={cn(
        'relative isolate flex-col justify-between overflow-hidden bg-brand-gradient p-10 text-brand-fg xl:p-14',
        className,
      )}
    >
      <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 -z-10 h-80 w-80 rounded-full bg-brand-fg/15 blur-3xl animate-fade-in" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 right-[-6rem] -z-10 h-96 w-96 rounded-full bg-brand-fg/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgb(var(--brand-fg)/0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgb(var(--brand-fg)/0.06)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />

      <div className="flex items-center gap-3">
        <img src="/favicon.svg" alt="" className="h-11 w-11 rounded-2xl bg-brand-fg/15 p-1.5 shadow-glow" />
        <span className="text-2xl font-semibold tracking-tight">Verba</span>
      </div>

      <div className="max-w-md space-y-8">
        <div className="space-y-4">
          <h2 className="text-[34px] font-semibold leading-[1.15] tracking-tight xl:text-4xl">
            Write and translate with a calm, capable assistant.
          </h2>
          <p className="text-[15px] leading-relaxed text-brand-fg/80">
            One workspace for translation, grammar, rewriting and replies, shared by your dashboard and Chrome extension.
          </p>
        </div>

        <ul className="space-y-4">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-fg/15 ring-1 ring-inset ring-brand-fg/20">
                <Icon size={17} aria-hidden />
              </span>
              <span>
                <span className="block text-[14.5px] font-medium">{title}</span>
                <span className="mt-0.5 block text-[13.5px] leading-relaxed text-brand-fg/75">{body}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-[12.5px] text-brand-fg/60">Verba · personal writing &amp; translation assistant</p>
    </aside>
  );
}
