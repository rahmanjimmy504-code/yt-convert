'use client';

import { useCallback, useEffect, useState } from 'react';
import NextLink from 'next/link';
import { Cookie, X } from 'lucide-react';
import {
  getConsentChoice,
  OPEN_COOKIE_PREFERENCES_EVENT,
  setConsentChoice,
  type ConsentChoice,
} from '@/lib/cookies';

/**
 * Privacy-first cookie-consent notice. Shown once per visitor (their choice is
 * remembered in a single first-party cookie) and reopenable any time from the
 * footer's "Cookie settings" link via OPEN_COOKIE_PREFERENCES_EVENT.
 */
export default function CookieConsent() {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setMounted(true);
    // No flash on first paint: the banner appears only after hydration, and
    // only for visitors who haven't made a choice yet.
    if (!getConsentChoice()) setVisible(true);
    const onOpen = () => setVisible(true);
    window.addEventListener(OPEN_COOKIE_PREFERENCES_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_COOKIE_PREFERENCES_EVENT, onOpen);
  }, []);

  const choose = useCallback((choice: ConsentChoice) => {
    setConsentChoice(choice);
    setVisible(false);
  }, []);

  if (!mounted) return null;

  return (
    <div
      role="region"
      aria-label="Cookie preferences"
      aria-hidden={!visible}
      className={
        'fixed bottom-4 inset-x-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[28rem] max-w-full z-[60] ' +
        'transition-all duration-300 motion-reduce:transition-none ' +
        (visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none')
      }
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl shadow-black/10 p-4 sm:p-5 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-50 dark:bg-red-950/40 flex items-center justify-center flex-shrink-0">
            <Cookie className="w-4.5 h-4.5 text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">We respect your privacy</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
              YT Convert doesn&apos;t use tracking or advertising cookies. The only cookie we set remembers this
              choice, and things like dark mode and recent conversions stay in your own browser. See our{' '}
              <NextLink
                href="/privacy"
                className="underline underline-offset-2 hover:text-red-500 transition-colors"
              >
                Privacy Policy
              </NextLink>
              .
            </p>
          </div>
          <button
            onClick={() => choose('dismissed')}
            aria-label="Dismiss cookie notice"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => choose('accepted')}
            className="h-10 px-4 rounded-xl bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-xs font-semibold shadow-lg shadow-red-500/20 transition-all flex-1"
          >
            Accept
          </button>
          <button
            onClick={() => choose('declined')}
            className="h-10 px-4 rounded-xl bg-gray-100 dark:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex-1"
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}
