import { NextResponse } from 'next/server';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { recordEvent } from '@/lib/stats';

export const runtime = 'nodejs';

const EVENT_LIMIT_PER_MINUTE = 60;
const MAX_CONVERTER_LENGTH = 100;
const MAX_PLATFORM_LENGTH = 40;
const MAX_ERROR_LENGTH = 300;

/**
 * POST /api/events
 *
 * Cookieless, privacy-friendly client-side events (converter clicks and
 * uncaught client errors). No identifiers, IPs, or URLs are stored — only
 * aggregate counters. Server-side lookup outcomes are recorded directly by
 * /api/video-info and do not go through this endpoint.
 */
export async function POST(request: Request) {
  const retryAfter = rateLimit(clientIp(request), EVENT_LIMIT_PER_MINUTE);
  if (retryAfter > 0) {
    return NextResponse.json({ error: 'Too many events.' }, { status: 429 });
  }

  let body: { type?: unknown; converter?: unknown; platform?: unknown; error?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid event.' }, { status: 400 });
  }

  if (body.type === 'converter_click') {
    const converter = typeof body.converter === 'string' ? body.converter.trim().slice(0, MAX_CONVERTER_LENGTH) : '';
    const platform = typeof body.platform === 'string' ? body.platform.trim().slice(0, MAX_PLATFORM_LENGTH) : '';
    if (!converter) return NextResponse.json({ error: 'Missing converter.' }, { status: 400 });
    recordEvent({ type: 'converter_click', converter, platform });
    return NextResponse.json({ ok: true });
  }

  if (body.type === 'client_error') {
    const error = typeof body.error === 'string' ? body.error.trim().slice(0, MAX_ERROR_LENGTH) : '';
    if (!error) return NextResponse.json({ error: 'Missing error message.' }, { status: 400 });
    recordEvent({ type: 'client_error', error });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unsupported event type.' }, { status: 400 });
}
