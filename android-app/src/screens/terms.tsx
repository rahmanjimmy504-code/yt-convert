/*
 * YT Convert for Android — GPLv3 companion app.
 * Copyright (C) 2026 rahmanjimmy504-code
 *
 * Adapted from the YT Convert website (src/app/terms/page.tsx), dual-licensed
 * by its copyright holder under the GNU General Public License v3 or later
 * for this repository.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version. See <https://www.gnu.org/licenses/>.
 */

import LegalPage, { Section } from '@/components/legal-page';

export default function TermsScreen() {
  return (
    <LegalPage title="Terms of Use" updated="August 14, 2026">
      <Section heading="Acceptance">
        <p>
          By installing or using YT Convert for Android you agree to these terms and to the GNU General Public
          License v3 or later, under which the app is distributed. If you do not agree, do not use the app.
        </p>
      </Section>

      <Section heading="What the app does">
        <p>
          The app looks up public metadata for links you paste and, where it legally and technically can, downloads
          a public stream directly to your device. No files are stored or proxied by us. DRM-protected catalogues
          (Spotify, Deezer, Apple Music, Amazon Music) are not ripped. When on-device downloading is not possible,
          the app points you at third-party converter websites or other Android downloader apps that we neither own
          nor operate.
        </p>
      </Section>

      <Section heading="Personal and lawful use">
        <p>
          The app is provided for personal, non-commercial use. You agree to use it only in ways that comply with
          applicable law and with the terms of the platforms involved. Only download content you own or have
          permission to use.
        </p>
      </Section>

      <Section heading="Third-party services">
        <p>
          Converter websites and other downloader apps are independent services with their own terms and privacy
          policies. We do not control their availability or behaviour and are not responsible for anything that
          happens there.
        </p>
      </Section>

      <Section heading="No warranty">
        <p>
          As stated in sections 15 and 16 of the GNU General Public License, this program is provided &ldquo;as
          is&rdquo; without warranty of any kind, and no copyright holder is liable for damages arising from its use.
          Metadata lookups and downloads may fail at any time as platforms change.
        </p>
      </Section>

      <Section heading="Your freedoms">
        <p>
          You may run, study, modify and redistribute the app under the terms of the GPL. If you distribute a
          modified version, you must release your changes under the same licence and make the corresponding source
          available. See the Licence screen for the full text and a link to the source.
        </p>
      </Section>
    </LegalPage>
  );
}
