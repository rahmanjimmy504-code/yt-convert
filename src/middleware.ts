// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Edge middleware: refuse obvious bots before they reach a serverless
 * function, while allowing the authenticated public API flow used by the SDK.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { botBlockEnabled, shouldBlockBot } from '@/lib/bot-block';

export function middleware(request: NextRequest) {
  if (!botBlockEnabled()) {
    return NextResponse.next();
  }

  const pathname = request.nextUrl.pathname;

  // CAPTCHA is itself the anti-bot gate. Blocking automated clients here
  // makes it impossible for the SDK to obtain a challenge/proof token.
  if (pathname === '/api/captcha') {
    return NextResponse.next();
  }

  // The SDK lookup is authenticated by the one-time CAPTCHA proof token.
  // The conversion endpoint is authenticated by its short-lived ticket.
  // Let those proofs reach their route handlers, where they are actually
  // verified and IP-bound.
  if (pathname === '/api/video-info' && request.headers.has('x-captcha-token')) {
    return NextResponse.next();
  }

  if (pathname === '/api/convert' && request.nextUrl.searchParams.has('ticket')) {
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

export const config = {
  matcher: [
    '/((?!_next/|favicon\\.ico|.*\\.(?:svg|png|jpe?g|gif|webp|ico|css|js|woff2?|ttf|txt|xml|json|webmanifest|map|apk)$).*)',
  ],
};
