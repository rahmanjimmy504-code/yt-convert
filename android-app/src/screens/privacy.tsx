/*
 * YT Convert for Android — GPLv3 companion app.
 * Copyright (C) 2026 rahmanjimmy504-code
 *
 * Adapted from the YT Convert website (src/app/privacy/page.tsx),
 * dual-licensed by its copyright holder under the GNU General Public License
 * v3 or later for this repository, and rewritten for an app with no server.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version. See <https://www.gnu.org/licenses/>.
 */

import LegalPage, { Section } from '@/components/legal-page';

export default function PrivacyScreen() {
  return (
    <LegalPage title="Privacy Policy" updated="August 14, 2026">
      <Section heading="What the app processes">
        <p>
          YT Convert for Android runs entirely on your device. When you paste a link, the app looks up public
          metadata (title, author, thumbnail, duration) and, where it legally and technically can, downloads the
          public stream directly from the platform over your own internet connection. There is no YT Convert server
          in the middle: we never see your links, and no media file ever reaches us.
        </p>
        <p>
          Your history, favourite converter, format choice and dark-mode preference are stored only in the app&apos;s
          local storage on this phone. Uninstalling the app removes them.
        </p>
      </Section>

      <Section heading="No accounts, no tracking, no analytics">
        <p>
          There is no sign-up, no advertising SDK, no analytics library and no crash reporter. The app does not
          collect usage statistics and contains no third-party trackers.
        </p>
      </Section>

      <Section heading="Network connections the app makes">
        <p>
          The app connects to the platform you pasted a link from (for example YouTube or SoundCloud) to read public
          metadata and fetch the media file, and to image hosts for thumbnails. If you tap Preview, the platform&apos;s
          own embedded player is loaded and its privacy policy applies. Nothing else is contacted unless you choose
          to open a converter.
        </p>
      </Section>

      <Section heading="Third-party converters and downloader apps">
        <p>
          Converter cards open in your phone&apos;s browser, not inside this app, so you can always see the address
          bar. The Seal / YTDLnis / NewPipe buttons hand the link to that app through an Android intent. From that
          point the other service or app is in charge, under its own terms and privacy policy.
        </p>
      </Section>

      <Section heading="Permissions">
        <p>
          The app requests internet access to fetch media, and notification permission so download progress can be
          shown and cancelled from the notification shade. Files are written through Android MediaStore, which does
          not require broad storage access on modern Android versions.
        </p>
      </Section>

      <Section heading="Children">
        <p>
          The app is not directed at children under 13 and knowingly collects no personal information from anyone.
        </p>
      </Section>

      <Section heading="Changes to this policy">
        <p>
          Material changes will be reflected by updating the &ldquo;Last updated&rdquo; date above and are visible in
          the app&apos;s public source history.
        </p>
      </Section>
    </LegalPage>
  );
}
