import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Logo } from '@/layouts/Logo';

/** Shown on the page and used for privacy requests. Change it here if the contact address changes. */
// Public contact address. Set VITE_CONTACT_EMAIL when building the website to use a different one.
const CONTACT_EMAIL: string = import.meta.env.VITE_CONTACT_EMAIL || 'mithleshnirmal786123@gmail.com';
const EFFECTIVE_DATE = '22 November 2026';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-[17px] font-semibold text-fg">{title}</h2>
      <div className="space-y-2 text-[14.5px] leading-7 text-muted">{children}</div>
    </section>
  );
}

/** Public privacy policy (no sign-in), linked from the Chrome Web Store listing. */
export default function PrivacyPage() {
  usePageTitle('Privacy policy', 'How Verba and the Verba Chrome extension collect, use and protect your data.');
  return (
    <div className="min-h-screen bg-bg">
      <header className="flex h-16 items-center border-b border-border px-4 sm:px-6">
        <Logo />
      </header>
      <main className="mx-auto w-full max-w-3xl space-y-8 px-4 py-10 sm:px-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Privacy policy</h1>
          <p className="text-[13.5px] text-subtle">Effective {EFFECTIVE_DATE}</p>
        </div>

        <Section title="What Verba is">
          <p>
            Verba translates text you write into English (or another language you pick) in several tones. It has a
            website and a Chrome extension. This policy explains what data they handle and why.
          </p>
        </Section>

        <Section title="Data we collect">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-fg">Account:</strong> your name and email. Your password is never stored, only a
              one-way hash of it. If you sign in with Google, we receive your Google name, email and account ID.
            </li>
            <li>
              <strong className="text-fg">Text you send to the AI:</strong> only what you submit with Translate, Ask or
              Reply, or what is in the text box when you press Translate in the popup or use the translate shortcut.
            </li>
            <li>
              <strong className="text-fg">Pictures:</strong> a screenshot you paste into Ask AI is sent to the AI model so
              it can read it and answer. The picture itself is not saved.
            </li>
            <li>
              <strong className="text-fg">Voice:</strong> the microphone is used only while you press the mic button.
              Chrome&apos;s own speech recognition turns your voice into text (Chrome sends the audio to Google for this).
              Verba receives only the text and never the audio.
            </li>
            <li>
              <strong className="text-fg">Feedback:</strong> if you send feedback, the message is saved with your account
              so we can read it. Do not put passwords or other private details in it. It is deleted when you delete your
              account.
            </li>
            <li>
              <strong className="text-fg">No history:</strong> Verba does not save the text you translate or the answers
              you get. They are used to produce your result and are not stored by Verba.
            </li>
            <li>
              <strong className="text-fg">Usage counts:</strong> how many prompts you use per day, to apply the daily
              free limit.
            </li>
            <li>
              <strong className="text-fg">Without an account:</strong> you can use a few free prompts a day. For that the
              extension makes a random ID on your device and the server counts your prompts under it, together with a
              one-way hash of your network address (not the address itself) to stop misuse.
            </li>
            <li>
              <strong className="text-fg">Technical data:</strong> your IP address is used briefly to block abuse (rate
              limiting).
            </li>
          </ul>
        </Section>

        <Section title="What the Chrome extension does">
          <p>
            The extension runs on the pages you visit only to remember which text box you last typed in, and to show a
            small Verba button in the message box on webmail sites such as Gmail and Outlook. It does not read, record
            or send anything until you act: open the Verba popup, press Translate, or use the translate shortcut. Then it
            reads the text of that one box, sends it for translation, and writes the result back into the box. It does
            not collect your browsing history, and it skips password and payment fields.
          </p>
        </Section>

        <Section title="How we use data">
          <p>
            Only to provide the translation service, apply daily limits, and keep accounts secure. We do not sell your
            data, show ads, or use your text to build profiles.
          </p>
        </Section>

        <Section title="Services that process your data">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-fg">An AI model provider</strong> (currently Google Gemini) receives the text and
              pictures you send, only to produce your answer. On Google's free API tier, Google may use submitted content
              to improve its products, under the Gemini API terms.
            </li>
            <li>
              <strong className="text-fg">Google Sign-In</strong>, only if you choose to sign in with Google. We get your
              name, email and account ID, and nothing else.
            </li>
            <li>
              <strong className="text-fg">Chrome speech recognition</strong>, only if you use the microphone (see Voice
              above).
            </li>
            <li>
              <strong className="text-fg">YouTube</strong> plays the tutorial video on the How to use page, only when
              you open that page.
            </li>
          </ul>
        </Section>

        <Section title="Security">
          <p>
            Data travels over HTTPS. Passwords are stored as salted hashes, stored API keys are encrypted, and sign-in
            sessions can be revoked at any time by logging out or by the admin.
          </p>
        </Section>

        <Section title="Keeping and deleting data">
          <p>
            Verba keeps no history of what you translate. To delete your account and all its data, email{' '}
            <a className="font-medium text-brand underline-offset-2 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            . Deleting an account removes its profile, usage counts, sessions and any feedback it sent.
          </p>
        </Section>

        <Section title="Changes and contact">
          <p>
            If this policy changes, the new version will be posted here with a new effective date. Questions:{' '}
            <a className="font-medium text-brand underline-offset-2 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </Section>

        <p className="pt-4 text-[13px]">
          <Link to="/login" className="font-medium text-brand underline-offset-2 hover:underline">
            Back to Verba
          </Link>
        </p>
      </main>
    </div>
  );
}
