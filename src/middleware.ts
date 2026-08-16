// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Edge middleware: refuse obvious bots before they reach a serverless
 * function, so metered hosts (Vercel, Cloudflare Workers free tier) do not
 * spend their request quota on scrapers, SEO crawlers, and AI harvesters.
 *
 * Returning a Response here short-circuits the request at the edge: it never
 * invokes a function, which is the whole point. The 403 body is deliberately
 * tiny (a short text note) so it costs almost nothing to serve.
 *
 * The blocking rules live in src/lib/bot-block.ts (pure and unit-tested).
 * Set DISABLE_BOT_BLOCK=1 to turn the check off.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { botBlockEnabled, shouldBlockBot } from '@/lib/bot-block';

export function middleware(request: NextRequest) {
  if (!botBlockEnabled()) {
    return NextResponse.next();
  }

  const userAgent = request.headers.get('user-agent');
  if (shouldBlockBot(userAgent)) {
    return new NextResponse('Request blocked: automated traffic is not served by this site.\n', {
      status: 403,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }

  return NextResponse.next();
}

/**
 * Run on every request except Next.js internals and static assets (which are
 * served without invoking a function anyway). API routes ARE included: a bot
 * hammering /api/convert is exactly the traffic we want to drop at the edge.
 */
export const config = {
  matcher: [
    '/((?!_next/|favicon\\.ico|.*\\.(?:svg|png|jpe?g|gif|webp|ico|css|js|woff2?|ttf|txt|xml|json|webmanifest|map|apk)$).*)',
  ],
};
