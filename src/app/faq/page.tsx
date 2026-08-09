import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
  title: 'FAQ',
  description:
    'Answers to common questions about YT Convert: supported platforms, how the converters work, privacy, and legal notes.',
  alternates: { canonical: '/faq' },
  openGraph: {
    title: 'YT Convert FAQ',
    description:
      'Supported platforms, how the converters work, privacy, and legal notes.',
    url: '/faq',
  },
};

const FAQS: { q: string; a: string }[] = [
  {
    q: 'What does YT Convert actually do?',
    a: 'YT Convert detects the platform of a link you paste (YouTube, Spotify, TikTok and 9 more), shows you the title, thumbnail and other metadata, and then routes you to a third-party converter site that performs the actual download. The URL is auto-copied to your clipboard so you only have to press Ctrl+V on the converter page.',
  },
  {
    q: 'Does YT Convert download or convert files itself?',
    a: 'No. Conversions happen entirely on the third-party converter sites listed on the results screen. This site never downloads, stores, or processes your media — it only fetches public metadata (title, thumbnail, duration) to help you pick the right converter.',
  },
  {
    q: 'Which platforms are supported?',
    a: 'YouTube, YT Music, SoundCloud, X (Twitter), Instagram, Spotify, Deezer, Apple Music, Amazon Music, TikTok, Facebook, Snapchat and BeReal. Paste a link from any of them and the platform is detected automatically.',
  },
  {
    q: 'Is it free? Do I need an account?',
    a: 'Yes, it is completely free and there is no account, sign-up, or email required. Nothing is tracked against a user identity, and your history and favorites are stored only in your own browser (localStorage).',
  },
  {
    q: 'Which format should I pick — MP3 or MP4?',
    a: 'Pick MP3 when you only want the audio (music, podcasts, voice). Pick MP4 when you want the video with sound. Converters that support the format you select are ranked higher on the results screen.',
  },
  {
    q: 'Why do some converter sites show ads?',
    a: 'The converters are independent third-party services that fund themselves with advertising. YT Convert has no control over their pages. If one converter has too many ads, go back and try another one from the list.',
  },
  {
    q: 'A converter did not work. What now?',
    a: 'Converter sites occasionally change domains or go offline. Each converter card shows a live \u201cWorking\u201d / \u201cUnavailable\u201d badge (checked automatically every 15 minutes, with a manual \u201cCheck again\u201d button), so if one is down you can see it before clicking. If a converter still fails, try another from the ranked list, and make sure you pasted the link into the converter\u2019s input box (the URL is auto-copied when you click a converter card).',
  },
  {
    q: 'How do I report a broken or unsafe converter?',
    a: 'Click the flag icon on the converter card and pick a reason: the link is dead (site down or 404), the site looks unsafe (scam, malware, fake download buttons), or it simply does not work for your platform/format. Reports are anonymous \u2014 no account or email needed \u2014 and are reviewed by the site owner. Flagged converters show a small \u201cflagged\u201d badge so other users can be cautious.',
  },
  {
    q: 'What do the green and red converter badges mean?',
    a: 'The site automatically probes every converter in the list (cheap HEAD/GET checks, cached for 15 minutes) and shows \u201cWorking\u201d in green or \u201cUnavailable\u201d in red next to its name. Unavailable converters may be temporarily down, blocking automated checks, or gone for good \u2014 treat the badge as a helpful signal, not a guarantee, since a converter can stop working for reasons a probe cannot see.',
  },
  {
    q: 'Can I install YT Convert as an app on my phone?',
    a: 'Yes. YT Convert is a progressive web app (PWA): on Android, open the site in Chrome and choose \u201cAdd to Home screen\u201d or \u201cInstall app\u201d; on iPhone, tap Share \u2192 \u201cAdd to Home Screen\u201d. It installs like a native app with its own icon and opens full-screen without the browser chrome.',
  },
  {
    q: 'What analytics does the site collect?',
    a: 'Only aggregate, cookieless counters: which platform a lookup was for, whether it succeeded, which converter was clicked, and bucketed error messages with numbers redacted. No IP addresses, full URLs, accounts, or personal data are stored, and there is no cross-site tracking. The counters exist so the site owner can see which platforms fail and keep converters honest. They are in-memory only and reset on every deploy.',
  },
  {
    q: 'My link is not recognized. What am I doing wrong?',
    a: 'Make sure you copied the full link, including the https:// part, and that it points to one of the 13 supported platforms. Channel or profile pages without a specific video/track are often not convertible — link to the exact video, track, or post instead.',
  },
  {
    q: 'Is it legal to convert and download media?',
    a: 'Only download content you own, that is in the public domain, or that is offered under a license permitting downloads. Most platforms\u2019 terms of service restrict downloading, and copyrighted material generally requires permission from the rights holder. YT Convert is intended for personal, lawful use only.',
  },
  {
    q: 'Do you store my links or history?',
    a: 'No. Your recent lookups and your favorite converter are saved in your browser\u2019s localStorage and never leave your device. Metadata lookups are cached on the server for a few minutes purely to avoid hammering upstream APIs.',
  },
];

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map(f => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
};

export default function FaqPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900 text-gray-900 dark:text-white">
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 select-none">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-red-500 to-red-600 shadow-lg shadow-red-500/20">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8Z" fill="white"/><path d="m9.75 15.02 5.75-3.02-5.75-3.02v6.04Z" fill="#FF0000"/></svg>
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight">YT Convert</h1>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Frequently asked questions</p>
            </div>
          </Link>
          <Link href="/" className="text-xs text-gray-500 hover:text-red-500 flex items-center gap-1 transition-colors" aria-label="Back to the converter">
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
            <details key={f.q} className="group bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 open:shadow-md transition-shadow">
              <summary className="flex items-center justify-between gap-3 cursor-pointer list-none p-4 text-sm font-semibold select-none [&::-webkit-details-marker]:hidden">
                {f.q}
                <span className="text-gray-400 group-open:rotate-45 transition-transform flex-shrink-0 text-lg leading-none font-normal" aria-hidden="true">+</span>
              </summary>
              <p className="px-4 pb-4 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-sm font-semibold shadow-lg shadow-red-500/20 transition-all">
            Convert a link
          </Link>
        </div>
      </main>

      <footer className="border-t border-gray-200 dark:border-gray-800 py-3 mt-auto">
        <p className="text-center text-[11px] text-gray-400">YT Convert {'\u2014'} For personal use only</p>
      </footer>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
    </div>
  );
}
