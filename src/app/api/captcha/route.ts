import { NextResponse } from 'next/server';
import {
  createLocalCaptcha,
  isTurnstileConfigured,
  verifyLocalCaptcha,
  type LocalCaptchaMode,
} from '@/lib/captcha';

export const runtime = 'nodejs';

const CAPTCHA_RATE_LIMIT = 30;
const CAPTCHA_RATE_WINDOW_MS = 60_000;
const rateMap = new Map<string, { count: number; start: number }>();

function clientIp(request: Request): string {
  return (
    (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

function rateLimited(ip: string): number {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now - entry.start >= CAPTCHA_RATE_WINDOW_MS) {
    rateMap.set(ip, { count: 1, start: now });
    if (rateMap.size > 1000) {
      for (const [key, value] of rateMap) {
        if (now - value.start >= CAPTCHA_RATE_WINDOW_MS) rateMap.delete(key);
      }
    }
    return 0;
  }

  entry.count += 1;
  return entry.count > CAPTCHA_RATE_LIMIT
    ? Math.ceil((entry.start + CAPTCHA_RATE_WINDOW_MS - now) / 1000)
    : 0;
}

/** Issue a local fallback challenge. Turnstile widgets are issued by Cloudflare. */
export async function GET(request: Request) {
  const retryAfter = rateLimited(clientIp(request));
  if (retryAfter > 0) {
    return NextResponse.json(
      { error: 'Too many CAPTCHA requests. Please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  // The public site key controls the client widget. This endpoint is only
  // needed by the dependency-free local fallback.
  if (isTurnstileConfigured()) {
    return NextResponse.json({ provider: 'turnstile' }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const modeParam = new URL(request.url).searchParams.get('mode');
  const mode: LocalCaptchaMode = modeParam === 'math' ? 'math' : 'visual';
  return NextResponse.json(
    { provider: 'local', ...createLocalCaptcha(mode) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

/** Verify a local fallback answer and return a one-time proof token. */
export async function POST(request: Request) {
  const retryAfter = rateLimited(clientIp(request));
  if (retryAfter > 0) {
    return NextResponse.json(
      { error: 'Too many CAPTCHA attempts. Please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  if (isTurnstileConfigured()) {
    return NextResponse.json(
      { error: 'CAPTCHA verification is handled by the Turnstile widget.' },
      { status: 400 },
    );
  }

  let body: { challengeId?: unknown; answer?: unknown };
  try {
    body = (await request.json()) as { challengeId?: unknown; answer?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid CAPTCHA request.' }, { status: 400 });
  }

  const challengeId = typeof body.challengeId === 'string' ? body.challengeId : '';
  const answer = typeof body.answer === 'string' ? body.answer : '';
  if (!challengeId || !answer || answer.length > 32) {
    return NextResponse.json({ error: 'Enter the CAPTCHA answer.' }, { status: 400 });
  }

  const token = verifyLocalCaptcha(challengeId, answer);
  if (!token) return NextResponse.json({ error: 'That CAPTCHA answer is not correct.' }, { status: 400 });
  return NextResponse.json({ token }, { headers: { 'Cache-Control': 'no-store' } });
}
