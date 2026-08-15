import type { ReactNode } from 'react';
import NextLink from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { LICENSE_SPDX, LICENSE_URL, SOURCE_URL } from '@/lib/site';

/**
 * Shared shell for the legal pages (/privacy, /terms). Keeps them visually
 * consistent with the converter page: same brand header, footer links, and
 * the app's light/dark gradient background. Server component — no hooks.
 */
export default function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900 text-gray-900 dark:text-white">
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <NextLink href="/" className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-red-500 to-red-600 shadow-lg shadow-red-500/20">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8Z" fill="white"/><path d="m9.75 15.02 5.75-3.02-5.75-3.02v6.04Z" fill="#FF0000"/></svg>
            </div>
            <h1 className="text-base font-bold tracking-tight">YT Convert</h1>
          </NextLink>
          <div className="flex items-center gap-2">
            <NextLink
              href="/"
              className="text-xs text-gray-500 hover:text-red-500 flex items-center gap-1 transition-colors"
              aria-label="Back to the converter"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </NextLink>
            <NextLink href="/faq" className="h-9 px-3 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs font-semibold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
              FAQ
            </NextLink>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
        <NextLink
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-red-500 transition-colors mb-4"
          aria-label="Back to the converter"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to converter
        </NextLink>
        <article className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 md:p-8 space-y-5">
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight">{title}</h2>
            <p className="text-[11px] text-gray-400">Last updated: {updated}</p>
          </div>
          {children}
        </article>
        <div className="mt-6 text-center">
          <NextLink
            href="/"
            className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-sm font-semibold shadow-lg shadow-red-500/20 transition-all"
            aria-label="Back to the converter"
          >
            <ArrowLeft className="w-4 h-4" /> Back to converter
          </NextLink>
        </div>
      </main>

      <footer className="border-t border-gray-200 dark:border-gray-800 py-3 mt-auto">
        <p className="text-center text-[11px] text-gray-400">
          {/* Software licence (GPL-3.0-or-later), distinct from the Terms. */}
          YT Convert {'\u2014'} free software under{' '}
          <a
            href={LICENSE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-red-500 underline-offset-2 hover:underline transition-colors"
          >
            {LICENSE_SPDX}
          </a>
          {' \u00B7 '}
          <a
            href={SOURCE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-red-500 underline-offset-2 hover:underline transition-colors"
          >
            Source
          </a>
          {' \u00B7 '}
          <NextLink href="/faq" className="hover:text-red-500 underline-offset-2 hover:underline transition-colors">FAQ</NextLink>
          {' \u00B7 '}
          <NextLink href="/privacy" className="hover:text-red-500 underline-offset-2 hover:underline transition-colors">Privacy</NextLink>
          {' \u00B7 '}
          <NextLink href="/terms" className="hover:text-red-500 underline-offset-2 hover:underline transition-colors">Terms</NextLink>
        </p>
      </footer>
    </div>
  );
}
