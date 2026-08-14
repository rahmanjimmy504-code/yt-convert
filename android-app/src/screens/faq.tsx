/*
 * YT Convert for Android — GPLv3 companion app.
 * Copyright (C) 2026 rahmanjimmy504-code
 *
 * FAQ screen. Adapted from the YT Convert website (src/app/faq/page.tsx),
 * dual-licensed by its copyright holder under the GNU General Public License
 * v3 or later for this repository. Answers are rewritten for the app: no
 * server, no CAPTCHA, on-device downloads.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version. See <https://www.gnu.org/licenses/>.
 */

import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { LogoTile } from '@/components/logo';

const FAQS: { q: string; a: string }[] = [
  {
    q: 'What does the YT Convert app do?',
    a: 'It detects the platform of a link you paste (YouTube, Spotify, TikTok and 10 more) and shows the title, thumbnail and other details. Where it legally and technically can, Download here extracts a public stream and saves it straight to your phone — nothing passes through a server. DRM catalogues are not ripped, and third-party converter cards remain as a fallback.',
  },
  {
    q: 'How is the app different from the website?',
    a: 'The website asks its server to look up metadata and proxy the file. The app does that work on your own phone instead: metadata comes from an on-device extractor, downloads use your own connection, progress appears as an Android notification, and files are saved through MediaStore so they show up in your gallery or music app. Because no shared server is involved, the app needs no CAPTCHA.',
  },
  {
    q: 'Why does the audio say M4A or WebM instead of MP3?',
    a: 'YouTube and similar platforms serve audio as M4A/AAC or WebM/Opus. Re-encoding to MP3 on the phone would cost time and quality, so this app saves the original stream and labels it honestly. The file plays in every modern Android music app.',
  },
  {
    q: 'Which platforms are supported?',
    a: 'YouTube, YT Music, SoundCloud, X (Twitter), Instagram, Spotify, Deezer, Apple Music, Amazon Music, TikTok, Facebook, Snapchat and BeReal. Paste a link from any of them and the platform is detected automatically.',
  },
  {
    q: 'Is it free? Do I need an account?',
    a: 'Yes, it is completely free, open-source software (GPLv3) and there is no account, sign-up or email required. Your history and favourites are stored only on your own device.',
  },
  {
    q: 'Why is "Download here" greyed out?',
    a: 'This build ships the interface and the native plugin skeleton only. Until on-device extraction is enabled, the button stays honestly disabled rather than pretending to work. You can still use the Android app handoff (Seal, YTDLnis, NewPipe) or a converter card in the meantime.',
  },
  {
    q: 'What about Spotify, Deezer, Apple Music and Amazon Music?',
    a: 'Those catalogues are DRM-protected. The app does not strip Widevine or FairPlay; it shows the preview and points you to a licensed option instead.',
  },
  {
    q: 'Does the app track me?',
    a: 'No. There is no analytics, no advertising SDK, no cookie banner and no account. The app only talks to the platform you paste a link from, plus any converter website you deliberately open.',
  },
  {
    q: 'Where does the app get permission to download?',
    a: 'Downloads are saved through Android MediaStore, which needs no broad storage permission on modern Android. A notification permission is requested so download progress can be shown and cancelled from the shade.',
  },
  {
    q: 'Is it legal to download media?',
    a: 'Only download content you own, that is in the public domain, or that is offered under a licence permitting downloads. Most platforms\u2019 terms restrict downloading, and copyrighted material generally requires permission from the rights holder. The app is intended for personal, lawful use only.',
  },
  {
    q: 'Where is the source code?',
    a: 'The whole app is licensed under the GNU General Public License v3 or later, and the source lives in the public yt-convert-android repository on GitHub. You may study, modify and redistribute it under the same terms. See the Licence screen for details.',
  },
];

export default function FaqScreen() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900 text-gray-900 dark:text-white">
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 select-none">
            <LogoTile />
            <div>
              <h1 className="text-base font-bold tracking-tight">YT Convert</h1>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Frequently asked questions</p>
            </div>
          </Link>
          <Link
            to="/"
            className="text-xs text-gray-500 hover:text-red-500 flex items-center gap-1 transition-colors"
            aria-label="Back to the converter"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
        <h2 className="text-xl font-bold tracking-tight mb-1">FAQ</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Everything you might want to know before converting a link.
        </p>
        <div className="space-y-3">
          {FAQS.map(f => (
            <details
              key={f.q}
              className="group bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 open:shadow-md transition-shadow"
            >
              <summary className="flex items-center justify-between gap-3 cursor-pointer list-none p-4 text-sm font-semibold select-none [&::-webkit-details-marker]:hidden">
                {f.q}
                <span
                  className="text-gray-400 group-open:rotate-45 transition-transform flex-shrink-0 text-lg leading-none font-normal"
                  aria-hidden="true"
                >
                  +
                </span>
              </summary>
              <p className="px-4 pb-4 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-sm font-semibold shadow-lg shadow-red-500/20 transition-all"
          >
            Convert a link
          </Link>
        </div>
      </main>

      <footer className="border-t border-gray-200 dark:border-gray-800 py-3 mt-auto">
        <p className="text-center text-[11px] text-gray-400">YT Convert {'\u2014'} For personal use only</p>
      </footer>
    </div>
  );
}
