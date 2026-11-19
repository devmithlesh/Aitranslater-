import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Logo } from '@/layouts/Logo';

/** Shown on the page and used for privacy requests. Change it here if the contact address changes. */
const CONTACT_EMAIL = 'mithlesh.nirmal@mastersunion.org';
const EFFECTIVE_DATE = '13 November 2026';

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
              <strong className="text-fg">Text you translate:</strong> only the text you submit with Translate (on the
              website) or that is in the focused text box when you open the extension popup.
            </li>
            <li>
              <strong className="text-fg">Translation history:</strong> the text and its translations are saved to your
              account for up to 90 days, so the service can show and manage your activity.
            </li>
            <li>
              <strong className="text-fg">Usage counts:</strong> how many translations you make per day, to apply the
              daily free limit.
            </li>
            <li>
              <strong className="text-fg">Technical data:</strong> your IP address is used briefly to block abuse (rate
              limiting).
            </li>
          </ul>
        </Section>

        <Section title="What the Chrome extension does">
          <p>
            The extension runs on the pages you visit only to remember which text box you last typed in. It does not
            read, record or send anything until you open the Verba popup. Then it reads the text of that one box, sends
            it for translation, and writes the version you choose back into the box only when you click Insert. It does
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
              <strong className="text-fg">Google Gemini API</strong> receives the text you translate. On Google's free
              API tier, Google may use submitted content to improve its products, under the Gemini API terms.
            </li>
            <li>
              <strong className="text-fg">Supabase</strong> stores accounts, history and usage (database).
            </li>
            <li>
              <strong className="text-fg">Render</strong> runs the Verba server; <strong className="text-fg">Netlify</strong>{' '}
              hosts the website.
            </li>
            <li>
              <strong className="text-fg">Google Sign-In</strong>, only if you choose to sign in with Google.
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
            History is kept for up to 90 days. To delete your account and all its data, email{' '}
            <a className="font-medium text-brand underline-offset-2 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            . Deleting an account removes its profile, history, usage and sessions.
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
