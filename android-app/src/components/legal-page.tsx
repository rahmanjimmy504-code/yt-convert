/*
 * YT Convert for Android — GPLv3 companion app.
 * Copyright (C) 2026 rahmanjimmy504-code
 *
 * Shared shell for the legal screens. Adapted from the YT Convert website
 * (src/components/legal-page.tsx), dual-licensed by its copyright holder
 * under the GNU General Public License v3 or later for this repository.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version. See <https://www.gnu.org/licenses/>.
 */

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { LogoTile } from './logo';

export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{heading}</h3>
      <div className="space-y-2 text-[13px] leading-relaxed text-gray-600 dark:text-gray-300">{children}</div>
    </section>
  );
}

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
          <Link to="/" className="flex items-center gap-3">
            <LogoTile />
            <h1 className="text-base font-bold tracking-tight">YT Convert</h1>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="text-xs text-gray-500 hover:text-red-500 flex items-center gap-1 transition-colors"
              aria-label="Back to the converter"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </Link>
            <Link
              to="/faq"
              className="h-9 px-3 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs font-semibold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              FAQ
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-red-500 transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to converter
        </Link>
        <article className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 md:p-8 space-y-5">
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight">{title}</h2>
            <p className="text-[11px] text-gray-400">Last updated: {updated}</p>
          </div>
          {children}
        </article>
        <div className="mt-6 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-sm font-semibold shadow-lg shadow-red-500/20 transition-all"
          >
            <ArrowLeft className="w-4 h-4" /> Back to converter
          </Link>
        </div>
      </main>

      <footer className="border-t border-gray-200 dark:border-gray-800 py-3 mt-auto">
        <p className="text-center text-[11px] text-gray-400">
          YT Convert {'\u2014'} For personal use only {'\u00B7'}{' '}
          <Link to="/faq" className="hover:text-red-500 underline-offset-2 hover:underline transition-colors">
            FAQ
          </Link>
          {' \u00B7 '}
          <Link to="/privacy" className="hover:text-red-500 underline-offset-2 hover:underline transition-colors">
            Privacy
          </Link>
          {' \u00B7 '}
          <Link to="/terms" className="hover:text-red-500 underline-offset-2 hover:underline transition-colors">
            Terms
          </Link>
          {' \u00B7 '}
          <Link to="/licence" className="hover:text-red-500 underline-offset-2 hover:underline transition-colors">
            Licence
          </Link>
        </p>
      </footer>
    </div>
  );
}
