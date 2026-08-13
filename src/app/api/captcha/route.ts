import { NextResponse } from 'next/server';
import {
  createLocalCaptcha,
  isTurnstileConfigured,
  verifyLocalCaptchaDetailed,
  type LocalCaptchaMode,
  type LocalCaptchaVerifyResult,
} from '@/lib/captcha';
import { clientIp, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const CAPTCHA_RATE_LIMIT = 30;

function captchaRateLimit(request: Request): number {
  return rateLimit(`captcha:${clientIp(request)}`, CAPTCHA_RATE_LIMIT);
}

/** Issue a local fallback challenge. Turnstile widgets are issued by Cloudflare. */
export async function GET(request: Request) {
  const retryAfter = captchaRateLimit(request);
  if (retryAfter > 0) {
    return NextResponse.json(
      { error: 'Too many CAPTCHA requests. Please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  const { searchParams } = new URL(request.url);
  // backup=1 forces the dependency-free local challenge even when Turnstile
  // keys are configured — this powers the "Use backup CAPTCHA" fallback in the
  // client when the Turnstile widget cannot connect or complete.
  const backup = searchParams.get('backup') === '1';

  // The public site key controls the client widget. This endpoint is only
  // needed by the dependency-free local fallback.
  if (isTurnstileConfigured() && !backup) {
    return NextResponse.json({ provider: 'turnstile' }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const mode: LocalCaptchaMode = searchParams.get('mode') === 'math' ? 'math' : 'visual';
  return NextResponse.json(
    { provider: 'local', ...createLocalCaptcha(mode) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

/** Verify a local fallback answer and return a one-time proof token. */
export async function POST(request: Request) {
  const retryAfter = captchaRateLimit(request);
  if (retryAfter > 0) {
    return NextResponse.json(
      { error: 'Too many CAPTCHA attempts. Please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
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

  // Local challenges can only be created via GET (optionally in backup mode),
  // so verification is always meaningful even when Turnstile keys are present.
  const result = verifyLocalCaptchaDetailed(challengeId, answer);
  if (!result.ok) {
    const messages: Record<Extract<LocalCaptchaVerifyResult, { ok: false }>['reason'], string> = {
      missing: 'This CAPTCHA is no longer valid. Get a new one.',
      expired: 'This CAPTCHA has expired. Get a new one.',
      'wrong-answer': 'That answer is not correct. Try again or refresh the challenge.',
      'too-many-attempts': 'Too many attempts on this CAPTCHA. Get a new one.',
    };
    return NextResponse.json({ error: messages[result.reason] }, { status: 400 });
  }
  return NextResponse.json({ token: result.token }, { headers: { 'Cache-Control': 'no-store' } });
}
