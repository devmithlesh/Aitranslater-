import { Link } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Logo } from '@/layouts/Logo';

const FEATURES: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: 'Hindi to English translator',
    body: 'Write in Hindi, Hinglish or any of 30+ languages and get clear, natural English back, right inside the text box you are typing in.',
  },
  {
    title: 'Hinglish support',
    body: 'Verba understands Hinglish (Hindi written in English letters) and can write it too. Translate it to English or turn English into Hinglish.',
  },
  {
    title: 'Every tone you need',
    body: 'Get more natural, professional, casual and friendly versions of the same message, and insert the one you like with a single click.',
  },
  {
    title: 'Reply to any message',
    body: 'Select a message in Gmail, WhatsApp Web or any site, click Reply, and Verba drafts replies in several tones and puts one in the reply box.',
  },
  {
    title: 'Ask AI, with screenshots',
    body: 'Ask a question or have a letter or email written. Paste a screenshot with Ctrl+V and the AI reads it and answers, like a chat assistant.',
  },
  {
    title: 'Speak instead of typing',
    body: 'Use the microphone to dictate text to translate, or speak your question to the AI.',
  },
];

const FAQ: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: 'What is Verba?',
    a: 'Verba is a free AI translation and writing assistant for Google Chrome. It translates, rewrites, explains and replies to text in any website, with a Hindi to English translator and Hinglish support built in.',
  },
  {
    q: 'Does Verba work with Hinglish?',
    a: 'Yes. You can pick Hinglish as the language to translate from or into, and Ask AI understands questions written in Hinglish.',
  },
  {
    q: 'Where does Verba work?',
    a: 'In most text boxes on the web, including Gmail, Outlook, WhatsApp Web and LinkedIn. Press Alt+Shift+V in a text box, click the Verba icon, or select text and right-click to explain it.',
  },
  {
    q: 'Is my text kept private?',
    a: 'Your text is only sent to translate or answer when you ask. Read the privacy policy for exactly what is stored.',
  },
];

/** Public home page for signed-out visitors. Plain, server-readable content so search engines can index it. */
export default function LandingPage() {
  usePageTitle(
    'Hindi to English translator, Hinglish & AI writing assistant (Chrome extension)',
    'Verba is a free Chrome extension: Hindi to English translator, Hinglish support, smart replies and an AI assistant that reads screenshots. Works in Gmail, WhatsApp Web and any text box.',
  );
  return (
    <div className="min-h-screen bg-bg">
      <header className="flex h-16 items-center justify-between border-b border-border px-4 sm:px-6">
        <Logo />
        <nav aria-label="Account" className="flex items-center gap-2 text-[13.5px]">
          <Link to="/guide" className="hidden rounded-lg px-3 py-1.5 font-medium text-muted hover:text-fg sm:inline-block">
            How to use
          </Link>
          <Link to="/login" className="rounded-lg px-3 py-1.5 font-medium text-muted hover:text-fg">
            Sign in
          </Link>
          <Link to="/signup" className="rounded-lg bg-brand-gradient px-3.5 py-1.5 font-semibold text-brand-fg shadow-glow hover:brightness-110">
            Get started free
          </Link>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-4xl space-y-14 px-4 py-12 sm:px-6">
        <section className="space-y-4 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
            Hindi to English translator and AI writing assistant for Chrome
          </h1>
          <p className="mx-auto max-w-2xl text-[16px] leading-7 text-muted">
            Verba translates, rewrites and replies right where you type. Write in Hindi or Hinglish, send perfect
            English, and ask the AI anything, even with a screenshot.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link to="/signup" className="rounded-xl bg-brand-gradient px-5 py-2.5 text-[14.5px] font-semibold text-brand-fg shadow-glow hover:brightness-110">
              Create your free account
            </Link>
            <Link to="/login" className="rounded-xl border border-border bg-surface px-5 py-2.5 text-[14.5px] font-medium text-fg hover:bg-surface-2">
              Sign in
            </Link>
          </div>
        </section>

        <section aria-labelledby="features" className="space-y-6">
          <h2 id="features" className="text-center text-2xl font-semibold tracking-tight text-fg">
            Everything you need to write and translate faster
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <li key={feature.title} className="rounded-2xl border border-border bg-surface p-5">
                <h3 className="text-[15px] font-semibold text-fg">{feature.title}</h3>
                <p className="mt-1.5 text-[14px] leading-6 text-muted">{feature.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="faq" className="space-y-5">
          <h2 id="faq" className="text-center text-2xl font-semibold tracking-tight text-fg">
            Frequently asked questions
          </h2>
          <dl className="space-y-4">
            {FAQ.map((item) => (
              <div key={item.q} className="rounded-2xl border border-border bg-surface p-5">
                <dt className="text-[15px] font-semibold text-fg">{item.q}</dt>
                <dd className="mt-1.5 text-[14px] leading-6 text-muted">{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <footer className="border-t border-border px-4 py-6 text-center text-[13px] text-subtle sm:px-6">
        <Link to="/guide" className="hover:text-fg">
          How to use
        </Link>
        <span className="mx-2" aria-hidden>
          ·
        </span>
        <Link to="/privacy" className="hover:text-fg">
          Privacy policy
        </Link>
        <span className="mx-2" aria-hidden>
          ·
        </span>
        <span>© Verba</span>
      </footer>
    </div>
  );
}
