'use client';

import { Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  buildConverterLaunchUrl,
  getConverterByName,
  getConverterHandoff,
  isSafeHandoffMediaUrl,
  isSafePostHandoff,
} from '@/lib/converters';

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900 text-gray-900 dark:text-white px-4">
      <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 text-center space-y-3">
        {children}
      </div>
    </div>
  );
}

function LoadingHandoff({ converterName }: { converterName?: string }) {
  return (
    <Shell>
      <div className="w-8 h-8 border-[3px] border-red-500 border-t-transparent rounded-full animate-spin mx-auto" />
      <h1 className="font-semibold text-sm">
        {converterName ? `Sending your link to ${converterName}…` : 'Opening converter…'}
      </h1>
      <p className="text-xs text-gray-500">Choose quality / kbps on the next page to download.</p>
    </Shell>
  );
}

function GoHandoff() {
  const searchParams = useSearchParams();
  const converterName = (searchParams.get('c') || '').trim();
  const mediaUrl = (searchParams.get('u') || '').trim();
  const converter = useMemo(() => getConverterByName(converterName), [converterName]);
  const safeMediaUrl = isSafeHandoffMediaUrl(mediaUrl);
  const handoff = useMemo(
    () => (converter ? getConverterHandoff(converter) : null),
    [converter],
  );
  const unsafePost = Boolean(
    converter && handoff?.kind === 'post' && !isSafePostHandoff(converter, handoff.action),
  );
  const destination = useMemo(
    () => (converter && safeMediaUrl ? buildConverterLaunchUrl(converter, mediaUrl) : ''),
    [converter, mediaUrl, safeMediaUrl],
  );
  const formRef = useRef<HTMLFormElement>(null);
  const activeRequestRef = useRef('');
  const completedRef = useRef(false);

  useEffect(() => {
    if (!converter || !handoff || !safeMediaUrl || unsafePost || !destination) return;

    const requestKey = `${converter.name}\n${mediaUrl}`;
    if (activeRequestRef.current !== requestKey) {
      activeRequestRef.current = requestKey;
      completedRef.current = false;
    }

    let disposed = false;
    const continueToConverter = () => {
      if (disposed || completedRef.current) return;
      completedRef.current = true;
      if (handoff.kind === 'post') {
        formRef.current?.submit();
      } else {
        window.location.replace(destination);
      }
    };

    // Try the clipboard once more in the newly-opened tab. The opener already
    // starts the same write during the click, but this protects users whose
    // browser changes focus before that promise settles. Never let a clipboard
    // permission prompt hold the converter handoff for more than a moment.
    const fallbackTimer = window.setTimeout(continueToConverter, 500);
    try {
      const copy = navigator.clipboard?.writeText(mediaUrl);
      if (copy) {
        void copy.then(continueToConverter, continueToConverter);
      } else {
        continueToConverter();
      }
    } catch {
      continueToConverter();
    }

    return () => {
      disposed = true;
      window.clearTimeout(fallbackTimer);
    };
  }, [converter, destination, handoff, mediaUrl, safeMediaUrl, unsafePost]);

  if (!converter || !safeMediaUrl) {
    return (
      <Shell>
        <h1 className="font-semibold text-sm">Could not open that converter</h1>
        <p className="text-xs text-gray-500">
          The converter or link is missing or not allowed. Go back and try again from YT Convert.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center h-10 px-4 rounded-xl bg-gradient-to-r from-red-500 to-red-600 text-white text-sm font-semibold"
        >
          Back to YT Convert
        </Link>
      </Shell>
    );
  }

  if (unsafePost) {
    return (
      <Shell>
        <h1 className="font-semibold text-sm">Unsafe converter handoff</h1>
        <p className="text-xs text-gray-500">This converter is misconfigured. Please pick another one.</p>
        <Link href="/" className="text-sm font-medium text-red-600">
          Back to YT Convert
        </Link>
      </Shell>
    );
  }

  return (
    <>
      <LoadingHandoff converterName={converter.name} />
      {handoff?.kind === 'post' ? (
        <form ref={formRef} action={handoff.action} method="post" acceptCharset="UTF-8" className="hidden">
          <input type="hidden" name={handoff.field} value={mediaUrl} />
          <noscript>
            <button type="submit">Continue to {converter.name}</button>
          </noscript>
        </form>
      ) : (
        <a href={destination} className="sr-only">
          Continue to {converter.name}
        </a>
      )}
    </>
  );
}

export default function GoPage() {
  return (
    <Suspense fallback={<LoadingHandoff />}>
      <GoHandoff />
    </Suspense>
  );
}
