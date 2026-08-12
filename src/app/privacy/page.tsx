import type { Metadata } from 'next';
import LegalPage from '@/components/legal-page';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How YT Convert handles your data: links are processed in your browser, no accounts, no tracking cookies, and no media files are stored.',
};

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{heading}</h3>
      <div className="space-y-2 text-[13px] leading-relaxed text-gray-600 dark:text-gray-300">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="August 12, 2026">
      <Section heading="What we process">
        <p>
          YT Convert is a link tool. When you paste a link, your browser sends it to our server to look up
          public metadata (title, author, thumbnail, duration) and, where we legally and technically can, to
          extract a public stream URL and proxy that file to you. We do not ask for an account, we do not store
          converted media (the file is streamed through and discarded), and we do not save your pasted links after
          the lookup completes. DRM-protected catalogs are not downloaded.
        </p>
        <p>
          Your conversion history and preferences (favorite converter, format, dark mode) are stored only in your own
          browser&apos;s local storage and never leave your device.
        </p>
      </Section>

      <Section heading="Human verification">
        <p>
          Metadata lookups are protected by a one-time human-verification check. A successful lookup mints a
          short-lived convert ticket (HMAC, bound to the link and your connection) so Download here cannot be
          used without that check. When Cloudflare Turnstile is
          enabled, Cloudflare processes the verification on your device according to its own privacy policy. When the
          built-in backup CAPTCHA is used, the server briefly holds the challenge and its answer in memory (with a
          short expiry) and discards them once the check is resolved; no personal data is collected.
        </p>
      </Section>

      <Section heading="Third-party converters">
        <p>
          When you choose a converter, we open a same-origin handoff page. AUTO-SEND converters receive a verified
          form or deep link. COPY NEEDED converters show your URL so you can copy it and paste on the landing page.
          From that point, the converter&apos;s own privacy policy applies. We recommend reviewing it
          before pasting anything, as we have no control over those services.
        </p>
      </Section>

      <Section heading="Cookies and tracking">
        <p>
          We do not use advertising cookies, fingerprinting, or third-party analytics. The only cookie we set is a
          first-party one that records your choice on the cookie notice (accept, decline, or dismiss). It lasts one
          year, is limited to the site itself, and can be cleared at any time through your browser settings. Your
          other preferences (dark mode, recent conversions, favorite converter, format) live only in your
          browser&apos;s local storage. Server logs may retain transient request metadata (such as IP address) for
          rate limiting and abuse prevention, and are not used for profiling.
        </p>
      </Section>

      <Section heading="Analytics">
        <p>
          To keep the service reliable, we collect a small amount of aggregate usage data: which platform a metadata
          lookup was for, whether the lookup succeeded, which converter card was clicked, and anonymized error
          messages (numbers are redacted). This data is cookieless, contains no IP addresses, full URLs, or personal
          information, and is never shared with third parties. Counters live in server memory only and reset on every
          redeploy; they cannot be used to identify you. The operator can turn this collection off entirely by setting
          <code> DISABLE_ANALYTICS=1 </code> on the server.
        </p>
      </Section>

      <Section heading="Converter reports">
        <p>
          If you use the flag button to report a converter as dead or unsafe, we receive the converter&apos;s name,
          the reason you picked, and any optional note you type (max 500 characters). Reports are stored anonymously
          in server memory for review and are not linked to your identity.
        </p>
      </Section>

      <Section heading="Children">
        <p>
          YT Convert is not directed at children under 13. We do not knowingly collect personal information from
          children. If you believe a child has provided us with personal information, please contact us and we will
          delete it.
        </p>
      </Section>

      <Section heading="Changes to this policy">
        <p>
          We may update this policy from time to time. Material changes will be reflected by updating the
          &ldquo;Last updated&rdquo; date above. Continued use of the site after changes means you accept the updated
          policy.
        </p>
      </Section>
    </LegalPage>
  );
}
