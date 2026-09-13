import { NextResponse } from 'next/server';
import { getSiteUrl } from '@/lib/site';

export const runtime = 'nodejs';

/**
 * Lightweight public liveness endpoint.
 *
 * Deliberately does not call third-party providers, databases, or paid
 * services. A 200 means the application runtime is serving requests; it does
 * not claim that every converter is healthy.
 */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: 'yt-convert',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      siteUrl: getSiteUrl(),
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  );
}
