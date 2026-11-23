import { DEFAULT_SHORTCUTS, GUIDE_VIDEO_ID } from '@verba/shared';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Logo } from '@/layouts/Logo';


function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-20 space-y-3">
      <h2 id={`${id}-h`} className="text-xl font-semibold tracking-tight text-fg">
        {title}
      </h2>
      <div className="space-y-3 text-[14.5px] leading-7 text-muted">{children}</div>
    </section>
  );
}

function Keys({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[12.5px] font-medium text-fg">
      {children}
    </kbd>
  );
}

/** A shortcut such as 'Alt+Shift+E' drawn as separate keys. Read from the shared defaults, so it never goes stale. */
function Shortcut({ value }: { value: string }) {
  const keys = value.split('+');
  return (
    <>
      {keys.map((key, index) => (
        <span key={key}>
          {index > 0 && '+'}
          <Keys>{key}</Keys>
        </span>
      ))}
    </>
  );
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="list-decimal space-y-1.5 pl-5 marker:font-medium marker:text-fg">{children}</ol>;
}

const CONTENTS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'video', label: 'Watch the video' },
  { id: 'start', label: 'Get started' },
  { id: 'shortcut', label: 'Translate with a shortcut' },
  { id: 'translate', label: 'Translate in the popup' },
  { id: 'reply', label: 'Reply to a message' },
  { id: 'ask', label: 'Ask AI (screenshots, templates)' },
  { id: 'voice', label: 'Speak instead of typing' },
  { id: 'free', label: 'Free prompts and sign-in' },
  { id: 'privacy', label: 'Your privacy' },
  { id: 'help', label: 'If something does not work' },
];

/** How to use Verba. Public (no sign-in), opened from the "How to use" icon in the extension popup. */
export default function GuidePage() {
  usePageTitle(
    'How to use Verba: Hindi to English translator and AI assistant',
    'Step-by-step guide to the Verba Chrome extension: translate with a keyboard shortcut, reply in WhatsApp Web and Gmail, ask AI with screenshots, and use your voice.',
  );
  return (
    <div className="min-h-screen bg-bg">
      <header className="flex h-16 items-center justify-between border-b border-border px-4 sm:px-6">
        <Logo />
        <nav aria-label="Account" className="flex items-center gap-2 text-[13.5px]">
          <Link to="/login" className="rounded-lg px-3 py-1.5 font-medium text-muted hover:text-fg">
            Sign in
          </Link>
          <Link to="/signup" className="rounded-lg bg-brand-gradient px-3.5 py-1.5 font-semibold text-brand-fg shadow-glow hover:brightness-110">
            Get started free
          </Link>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-12 px-4 py-10 sm:px-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-fg">How to use Verba</h1>
          <p className="text-[15.5px] leading-7 text-muted">
            Verba translates, rewrites and replies right where you type. This guide shows every feature in a few
            steps.
          </p>
        </div>

        <nav aria-label="On this page" className="rounded-2xl border border-border bg-surface p-4">
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-subtle">On this page</p>
          <ul className="grid gap-1 text-[14px] sm:grid-cols-2">
            {CONTENTS.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`} className="text-brand hover:underline">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <Section id="video" title="Watch the video">
          <div className="aspect-video w-full overflow-hidden rounded-2xl border border-border bg-black shadow-card">
            <iframe
              className="h-full w-full"
              src={`https://www.youtube-nocookie.com/embed/${GUIDE_VIDEO_ID}`}
              title="Verba: how to use the extension (YouTube video player)"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
        </Section>

        <Section id="start" title="Get started">
          <Steps>
            <li>Install the Verba extension and pin it: click the puzzle icon in Chrome, then the pin next to Verba.</li>
            <li>
              Click the Verba icon, or press <Shortcut value={DEFAULT_SHORTCUTS.openPopup} /> while you are in any text box.
            </li>
            <li>You can use 5 prompts every day without an account. Sign in (it is free) when you want more.</li>
          </Steps>
        </Section>

        <Section id="shortcut" title="Translate with a shortcut, without opening Verba">
          <p>This is the fastest way. You never open the popup.</p>
          <Steps>
            <li>Type your message in WhatsApp Web, Gmail, LinkedIn or any text box, in any language.</li>
            <li>
              With the cursor still in the box, press <Shortcut value={DEFAULT_SHORTCUTS.translateInPlace} />.
            </li>
            <li>A small message appears at the bottom right: &ldquo;Translating…&rdquo; and then &ldquo;Translated ✓&rdquo;.</li>
            <li>The text in the box is now the translation. Press Enter to send.</li>
          </Steps>
          <p>
            It translates into the language chosen in the <strong className="font-medium text-fg">To</strong> box of the
            popup (English at first), in the tone you picked last.
          </p>
          <p>
            Is the shortcut not working, or does another app use it? Open <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[13px] text-fg">chrome://extensions/shortcuts</code>{' '}
            in Chrome and set any keys you like next to &ldquo;Translate the text you typed in the focused box&rdquo;.
          </p>
        </Section>

        <Section id="translate" title="Translate in the popup">
          <Steps>
            <li>Open Verba. The text from the box you were typing in (or the text you highlighted) is already filled in.</li>
            <li>
              Pick the languages in <strong className="font-medium text-fg">From</strong> and{' '}
              <strong className="font-medium text-fg">To</strong>. Hindi to English is the default. The arrows swap them.
            </li>
            <li>Press Translate. Choose a tone: natural, professional, casual, polite, funny or formal.</li>
            <li>Press Insert to put the result into the box, or Copy. Clear empties everything so you can start again.</li>
          </Steps>
          <p>
            Hinglish (Hindi written in English letters) is in the language list, both to translate from and to write.
          </p>
        </Section>

        <Section id="reply" title="Reply to a message">
          <Steps>
            <li>On the page, highlight the message you want to answer (for example a message in WhatsApp Web or an email).</li>
            <li>Open Verba and press <strong className="font-medium text-fg">Reply to this</strong>.</li>
            <li>
              Optional: type what you want to say, for example &ldquo;say I will come tomorrow&rdquo;, and choose the language.
            </li>
            <li>Verba writes replies in several tones and puts one straight into the reply box. Pick another tone to swap it, or press Insert.</li>
          </Steps>
          <p>
            Press <strong className="font-medium text-fg">Explain</strong> on the same card to get a simple explanation of
            the highlighted text in the side panel. You can also right-click highlighted text and choose Explain with Verba.
          </p>
        </Section>

        <Section id="ask" title="Ask AI (screenshots, templates)">
          <Steps>
            <li>Open the Ask AI tab. Type a question, or ask Verba to write something.</li>
            <li>
              No idea what to ask? Tap one of the ready templates: leave application, email, follow-up, cover letter,
              complaint, payment reminder, reply or explain. Replace the parts in [brackets].
            </li>
            <li>
              Have a screenshot? Press <Keys>Ctrl</Keys>+<Keys>V</Keys> in the box. It appears as a small picture (up to 3). The AI reads it and answers.
            </li>
            <li>Choose the language of the answer, then press Ask (or <Keys>Ctrl</Keys>+<Keys>Enter</Keys>).</li>
          </Steps>
        </Section>

        <Section id="voice" title="Speak instead of typing">
          <Steps>
            <li>Press the microphone button next to Translate or Ask.</li>
            <li>The first time, Chrome needs your permission. Verba shows an &ldquo;Allow microphone&rdquo; link that opens a page with Chrome&rsquo;s prompt. Choose Allow.</li>
            <li>Speak. Your words appear in the box. Press the square button to stop.</li>
          </Steps>
        </Section>

        <Section id="free" title="Free prompts and sign-in">
          <p>
            Without an account you get 5 free prompts a day for Translate, Ask AI and Reply. The counter at the top of
            the popup shows how many are left. When they are used up, sign in or create a free account to continue.
            Signing in with Google takes one click.
          </p>
        </Section>

        <Section id="privacy" title="Your privacy">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Verba reads the text in a box only when you ask it to: you open the popup, press Translate, or use the shortcut.</li>
            <li>It skips password and payment fields.</li>
            <li>
              The text (and any screenshot) you send is processed by an AI model to give you the answer. Your voice is turned
              into text by Chrome; Verba never receives the audio.
            </li>
            <li>Verba does not keep a history of what you translate or ask. You can delete your account and its data at any time.</li>
          </ul>
          <p>
            Read the full{' '}
            <Link to="/privacy" className="text-brand hover:underline">
              privacy policy
            </Link>
            .
          </p>
        </Section>

        <Section id="help" title="If something does not work">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="font-medium text-fg">Nothing happens on a page:</strong> reload the page once. Chrome&rsquo;s own pages,
              the Web Store and PDF viewer cannot be used with extensions.
            </li>
            <li>
              <strong className="font-medium text-fg">The microphone does not type anything:</strong> check Windows Settings, Privacy &amp; security, Microphone,
              and that the right microphone is chosen. Verba shows what stage the microphone is at.
            </li>
            <li>
              <strong className="font-medium text-fg">&ldquo;Free prompts used up&rdquo;:</strong> they reset every day at midnight. Sign in for more.
            </li>
            <li>
              <strong className="font-medium text-fg">The shortcut does nothing:</strong> set it at{' '}
              <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[13px] text-fg">chrome://extensions/shortcuts</code>.
            </li>
          </ul>
        </Section>

        <p className="text-[14px] text-muted">
          Questions or ideas? Press the feedback icon in the popup after you sign in. Read the{' '}
          <Link to="/privacy" className="text-brand hover:underline">
            privacy policy
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
