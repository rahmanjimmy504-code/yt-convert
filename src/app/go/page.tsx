import type { Metadata } from 'next';
import Link from 'next/link';
import {
  buildConverterLaunchUrl,
  getConverterByName,
  getConverterHandoff,
  isSafeHandoffMediaUrl,
  isSafePostHandoff,
} from '@/lib/converters';

export const metadata: Metadata = {
  title: 'Opening converter',
  robots: { index: false, follow: false },
};

interface GoPageProps {
  searchParams: Promise<{ c?: string; u?: string }>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900 text-gray-900 dark:text-white px-4">
      <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 text-center space-y-3">
        {children}
      </div>
    </div>
  );
}

export default async function GoPage({ searchParams }: GoPageProps) {
  const params = await searchParams;
  const converter = getConverterByName((params.c || '').trim());
  const mediaUrl = (params.u || '').trim();

  if (!converter || !isSafeHandoffMediaUrl(mediaUrl)) {
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

  const handoff = getConverterHandoff(converter);

  if (handoff.kind === 'post') {
    if (!isSafePostHandoff(converter, handoff.action)) {
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
      <Shell>
        <div className="w-8 h-8 border-[3px] border-red-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <h1 className="font-semibold text-sm">Sending your link to {converter.name}…</h1>
        <p className="text-xs text-gray-500">Choose quality / kbps on the next page to download.</p>
        <form id="handoff" action={handoff.action} method="post" acceptCharset="UTF-8">
          <input type="hidden" name={handoff.field} value={mediaUrl} />
          <noscript>
            <button
              type="submit"
              className="mt-2 h-10 px-4 rounded-xl bg-gradient-to-r from-red-500 to-red-600 text-white text-sm font-semibold"
            >
              Continue to {converter.name}
            </button>
          </noscript>
        </form>
        <script
          dangerouslySetInnerHTML={{
            __html: 'document.getElementById("handoff") && document.getElementById("handoff").submit();',
          }}
        />
      </Shell>
    );
  }

  const dest = buildConverterLaunchUrl(converter, mediaUrl);

  return (
    <Shell>
      <div className="w-8 h-8 border-[3px] border-red-500 border-t-transparent rounded-full animate-spin mx-auto" />
      <h1 className="font-semibold text-sm">Sending your link to {converter.name}…</h1>
      <p className="text-xs text-gray-500">Choose quality / kbps on the next page to download.</p>
      <a href={dest} className="text-sm font-medium text-red-600">
        Continue if nothing happens
      </a>
      <script
        dangerouslySetInnerHTML={{
          __html: `location.replace(${JSON.stringify(dest)});`,
        }}
      />
    </Shell>
  );
}
