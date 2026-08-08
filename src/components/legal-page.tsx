import type { ReactNode } from 'react';
import NextLink from 'next/link';

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
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <NextLink href="/" className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-red-500 to-red-600 shadow-lg shadow-red-500/20">
              {/* Brand mark: a bold download arrow — the YT Convert logo. */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white" aria-hidden="true" focusable="false"><path d="M8.5 3.5 H15.5 V11.5 H20 L12 20.5 L4 11.5 H8.5 Z" /></svg>
            </div>
            <h1 className="text-base font-bold tracking-tight">YT Convert</h1>
          </NextLink>
          <NextLink href="/faq" className="h-9 px-3 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs font-semibold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
            FAQ
          </NextLink>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
        <article className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 md:p-8 space-y-5">
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight">{title}</h2>
            <p className="text-[11px] text-gray-400">Last updated: {updated}</p>
          </div>
          {children}
        </article>
      </main>

      <footer className="border-t border-gray-200 dark:border-gray-800 py-3 mt-auto">
        <p className="text-center text-[11px] text-gray-400">
          YT Convert {'\u2014'} For personal use only {'\u00B7'}{' '}
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
