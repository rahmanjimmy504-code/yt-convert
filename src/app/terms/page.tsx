import type { Metadata } from 'next';
import LegalPage from '@/components/legal-page';
import { LICENSE_URL, SOURCE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'The terms for using YT Convert: a free link tool that aggregates third-party converters and shows media previews. Personal use only.',
};

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{heading}</h3>
      <div className="space-y-2 text-[13px] leading-relaxed text-gray-600 dark:text-gray-300">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="August 8, 2026">
      <Section heading="Acceptance of terms">
        <p>
          By accessing or using YT Convert, you agree to these Terms of Service. If you do not agree, please do not
          use the site. We may update these terms from time to time; the &ldquo;Last updated&rdquo; date above shows
          when the current version took effect.
        </p>
      </Section>

      <Section heading="What the service does">
        <p>
          YT Convert is a free link tool. It looks up public metadata for links you paste and, where we legally and
          technically can, extracts a public stream and proxies it to your browser. We do not store those files.
          DRM-protected catalogs (Spotify, Deezer, Apple Music, Amazon Music) are not ripped. When first-party
          conversion is not possible or fails, we direct you to third-party converter websites that are not owned
          or operated by us.
        </p>
      </Section>

      <Section heading="Personal use and lawful use of this service">
        <p>
          This hosted instance of YT Convert is provided for personal, non-commercial use. You agree to use it only in
          ways that comply with applicable law and with the terms of the platforms and converter services involved.
          Only convert or download content you own or have permission to use.
        </p>
        <p>
          This is a condition of using the service we host. It is not the licence of the software, which is covered
          below.
        </p>
      </Section>

      <Section heading="Software licence (separate from these terms)">
        <p>
          These terms govern your use of the hosted <em>service</em>. The <em>software</em> that runs YT Convert is
          separate: it is free software released under the GNU General Public License, version 3 or (at your option)
          any later version. You may run, study, modify, and redistribute the code on those terms, including
          commercially, and the complete corresponding source is published at{' '}
          <a
            href={SOURCE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-red-500 underline-offset-2 hover:underline"
          >
            github.com/rahmanjimmy504-code/yt-convert
          </a>
          .
        </p>
        <p>
          The &ldquo;personal, non-commercial use&rdquo; condition above applies to this hosted instance and its
          bandwidth, not to the source code, and it is not a restriction on the rights the GPL grants you. The
          licence text is in{' '}
          <a
            href={LICENSE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-red-500 underline-offset-2 hover:underline"
          >
            LICENSE
          </a>
          ; third-party components keep their own licences, listed in THIRD_PARTY_NOTICES.md.
        </p>
      </Section>

      <Section heading="Third-party converters">
        <p>
          Converter websites are independent services with their own terms and privacy policies. We do not control
          their availability, pricing, features, or behavior, and we are not responsible for anything that happens on
          their sites. When you click a converter, your link and clipboard contents are handled by that service.
        </p>
      </Section>

      <Section heading="No guarantees">
        <p>
          The service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of any kind.
          We do not guarantee that metadata lookups will succeed, that any converter will remain available or work
          with a particular link, or that the service will be uninterrupted or error-free.
        </p>
      </Section>

      <Section heading="Limitation of liability">
        <p>
          To the maximum extent permitted by law, we are not liable for any indirect, incidental, special, or
          consequential damages arising from your use of the service, including from links you open, content you
          download, or actions taken on third-party sites.
        </p>
      </Section>

      <Section heading="Intellectual property">
        <p>
          The YT Convert name and logo are our assets; the source code is licensed to you under GPL-3.0-or-later as
          described above. Third-party names, logos, and trademarks belong to their respective owners and are
          referenced only to identify compatible services.
        </p>
      </Section>
    </LegalPage>
  );
}
