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
    <LegalPage title="Privacy Policy" updated="August 8, 2026">
      <Section heading="What we process">
        <p>
          YT Convert is a link tool. When you paste a link, your browser sends it to our server only to look up
          public metadata (title, author, thumbnail, duration) so the page can show a preview. We do not ask for an
          account, we do not store the media you convert, and we do not save your pasted links after the lookup
          completes.
        </p>
        <p>
          Your conversion history and preferences (favorite converter, format, dark mode) are stored only in your own
          browser&apos;s local storage and never leave your device.
        </p>
      </Section>

      <Section heading="Human verification">
        <p>
          Metadata lookups are protected by a one-time human-verification check. When Cloudflare Turnstile is
          enabled, Cloudflare processes the verification on your device according to its own privacy policy. When the
          built-in backup CAPTCHA is used, the server briefly holds the challenge and its answer in memory (with a
          short expiry) and discards them once the check is resolved; no personal data is collected.
        </p>
      </Section>

      <Section heading="Third-party converters">
        <p>
          When you choose a converter, we open its website in a new tab and copy your link to the clipboard so you can
          paste it there. From that point, the converter&apos;s own privacy policy applies. We recommend reviewing it
          before pasting anything, as we have no control over those services.
        </p>
      </Section>

      <Section heading="Cookies and tracking">
        <p>
          We do not use advertising cookies, fingerprinting, or third-party analytics. The only storage used is your
          browser&apos;s local storage for the preferences described above. Server logs may retain transient request
          metadata (such as IP address) for rate limiting and abuse prevention, and are not used for profiling.
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
