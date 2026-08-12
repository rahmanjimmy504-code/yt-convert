'use client';

import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  buildConverterLaunchUrl,
  getConverterByName,
  getConverterHandoff,
  hasAutomaticHandoff,
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

function copyWithFallback(text: string, input: HTMLInputElement | null): boolean {
  try {
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text);
    }
  } catch {
    // fall through to execCommand
  }
  if (!input) return false;
  input.focus();
  input.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  }
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
  const automatic = Boolean(converter && hasAutomaticHandoff(converter));
  const unsafePost = Boolean(
    converter && handoff?.kind === 'post' && !isSafePostHandoff(converter, handoff.action),
  );
  const destination = useMemo(
    () => (converter && safeMediaUrl ? buildConverterLaunchUrl(converter, mediaUrl) : ''),
    [converter, mediaUrl, safeMediaUrl],
  );
  const formRef = useRef<HTMLFormElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const completedRef = useRef(false);
  const [copyHint, setCopyHint] = useState('');

  useEffect(() => {
    if (!converter || !handoff || !safeMediaUrl || unsafePost || !destination) return;
    if (!automatic) return;
    if (completedRef.current) return;
    completedRef.current = true;
    if (handoff.kind === 'post') {
      formRef.current?.submit();
    } else {
      window.location.replace(destination);
    }
  }, [automatic, converter, destination, handoff, safeMediaUrl, unsafePost]);

  const continueAfterCopy = async () => {
    if (!converter || !destination) return;
    const copied = await copyWithFallback(mediaUrl, urlInputRef.current);
    setCopyHint(
      copied
        ? 'Link copied. Opening the converter…'
        : 'Could not copy automatically. Select the link above, copy it, then continue.',
    );
    if (copied) {
      window.location.assign(converter.url);
      return;
    }
    urlInputRef.current?.focus();
    urlInputRef.current?.select();
  };

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

  if (!automatic) {
    return (
      <Shell>
        <p className="text-[10px] font-bold tracking-wide text-amber-600">COPY NEEDED</p>
        <h1 className="font-semibold text-sm">Copy your link, then open {converter.name}</h1>
        <p className="text-xs text-gray-500">
          This converter has no verified auto-fill. Copy the link, then paste it on the next page.
        </p>
        <input
          ref={urlInputRef}
          readOnly
          value={mediaUrl}
          onFocus={e => e.currentTarget.select()}
          className="w-full h-10 px-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs font-mono"
        />
        <button
          type="button"
          onClick={continueAfterCopy}
          className="w-full h-10 rounded-xl bg-gradient-to-r from-red-500 to-red-600 text-white text-sm font-semibold"
        >
          Copy link and continue
        </button>
        {copyHint && <p className="text-xs text-gray-500">{copyHint}</p>}
        <a href={converter.url} className="text-xs text-red-600 font-medium">
          Open {converter.name} without copying
        </a>
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
