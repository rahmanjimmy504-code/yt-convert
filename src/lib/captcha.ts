import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * A small, dependency-free CAPTCHA used when Turnstile is not configured.
 * It keeps the project usable in local development while still making the
 * production integration fail closed when TURNSTILE_SECRET_KEY is present.
 *
 * Supports multiple providers:
 * - Cloudflare Turnstile (primary when configured)
 * - Google reCAPTCHA v2 (fallback alternative)
 * - hCaptcha (fallback alternative)
 * - Local visual/math challenge (always available as ultimate fallback / backup)
 *
 * The stores intentionally follow the same in-memory convention as the
 * metadata cache/rate limiter in this project. Set CAPTCHA_SECRET in a
 * multi-instance deployment so signed values remain valid across restarts;
 * use a shared store if challenge persistence must span serverless instances.
 */

export type LocalCaptchaMode = 'visual' | 'math';

export interface LocalCaptchaChallenge {
  challengeId: string;
  mode: LocalCaptchaMode;
  image?: string;
  question?: string;
}

interface StoredChallenge {
  answer: string;
  expiresAt: number;
  attempts: number;
}

interface StoredToken {
  expiresAt: number;
  used: boolean;
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const TOKEN_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_ENTRIES = 2000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const challenges = new Map<string, StoredChallenge>();
const tokens = new Map<string, StoredToken>();

// Share a random fallback across route bundles in the same Node process. A
// stable CAPTCHA_SECRET is still required when a deployment has more than one
// instance, otherwise an instance restart invalidates outstanding checks.
const globalForCaptcha = globalThis as typeof globalThis & { __ytConvertCaptchaSecret?: string };
const secret = process.env.CAPTCHA_SECRET || (globalForCaptcha.__ytConvertCaptchaSecret ??= randomBytes(32).toString('hex'));

function sign(value: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function safeSignatureEquals(actual: string, expected: string): boolean {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function signedValue(payload: string): string {
  return `${payload}.${sign(payload)}`;
}

function validSignedValue(value: string): string | null {
  const separator = value.lastIndexOf('.');
  if (separator <= 0 || separator === value.length - 1) return null;
  const payload = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  return safeSignatureEquals(signature, sign(payload)) ? payload : null;
}

function randomCode(length: number): string {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += CODE_CHARS[randomBytes(1)[0] % CODE_CHARS.length];
  }
  return code;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, char => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    };
    return entities[char];
  });
}

/** Render a deliberately noisy image so the visual mode looks like a CAPTCHA. */
function renderCaptchaSvg(answer: string): string {
  const lines = Array.from({ length: 7 }, (_, index) => {
    const x1 = 8 + (randomBytes(1)[0] % 24);
    const y1 = 10 + (randomBytes(1)[0] % 42);
    const x2 = 180 - (randomBytes(1)[0] % 24);
    const y2 = 10 + (randomBytes(1)[0] % 42);
    const color = ['#c2410c', '#2563eb', '#15803d', '#9333ea'][index % 4];
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1.2" opacity=".38"/>`;
  }).join('');

  const dots = Array.from({ length: 28 }, () => {
    const x = 4 + (randomBytes(1)[0] % 172);
    const y = 5 + (randomBytes(1)[0] % 50);
    return `<circle cx="${x}" cy="${y}" r="${((randomBytes(1)[0] % 10) / 10 + 0.4).toFixed(1)}" fill="#475569" opacity=".28"/>`;
  }).join('');

  const characters = answer.split('').map((char, index) => {
    const x = 23 + index * 29;
    const y = 39 + (randomBytes(1)[0] % 9) - 4;
    const rotation = (randomBytes(1)[0] % 25) - 12;
    const color = ['#991b1b', '#1d4ed8', '#166534', '#7e22ce', '#9a3412'][index % 5];
    return `<text x="${x}" y="${y}" transform="rotate(${rotation} ${x} ${y})" fill="${color}" font-family="Arial,sans-serif" font-size="27" font-weight="700">${escapeXml(char)}</text>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="188" height="60" viewBox="0 0 188 60" role="img" aria-label="CAPTCHA challenge"><rect width="188" height="60" rx="10" fill="#f8fafc"/>${dots}${lines}${characters}</svg>`;
}

function pruneStores(now = Date.now()): void {
  if (challenges.size > MAX_ENTRIES) {
    for (const [id, value] of challenges) {
      if (value.expiresAt <= now || challenges.size > MAX_ENTRIES) challenges.delete(id);
      if (challenges.size <= MAX_ENTRIES) break;
    }
  }
  if (tokens.size > MAX_ENTRIES) {
    for (const [token, value] of tokens) {
      if (value.expiresAt <= now || tokens.size > MAX_ENTRIES) tokens.delete(token);
      if (tokens.size <= MAX_ENTRIES) break;
    }
  }
}

export function createLocalCaptcha(mode: LocalCaptchaMode = 'visual'): LocalCaptchaChallenge {
  const challengeId = randomBytes(18).toString('base64url');
  let answer: string;
  let image: string | undefined;
  let question: string | undefined;

  if (mode === 'math') {
    const left = 2 + (randomBytes(1)[0] % 8);
    const right = 2 + (randomBytes(1)[0] % 8);
    answer = String(left + right);
    question = `What is ${left} + ${right}?`;
  } else {
    answer = randomCode(5);
    image = renderCaptchaSvg(answer);
  }

  challenges.set(challengeId, { answer, expiresAt: Date.now() + CHALLENGE_TTL_MS, attempts: 0 });
  pruneStores();
  return { challengeId, mode, image, question };
}

export type LocalCaptchaVerifyResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'missing' | 'expired' | 'wrong-answer' | 'too-many-attempts' };

/**
 * Check a local challenge and mint a one-time proof token. Visual mode
 * renders the server-generated answer as a noisy image rather than plain UI text.
 * The detailed result lets the API return a specific, human-readable message
 * for missing, expired, rejected, or locked challenges.
 */
export function verifyLocalCaptchaDetailed(challengeId: string, answer: string): LocalCaptchaVerifyResult {
  const challenge = challenges.get(challengeId);
  const now = Date.now();
  if (!challenge) return { ok: false, reason: 'missing' };
  if (challenge.expiresAt <= now) {
    challenges.delete(challengeId);
    return { ok: false, reason: 'expired' };
  }

  challenge.attempts += 1;
  const normalized = answer.trim().replace(/\s+/g, '').toUpperCase();
  if (normalized !== challenge.answer) {
    if (challenge.attempts >= MAX_ATTEMPTS) {
      challenges.delete(challengeId);
      return { ok: false, reason: 'too-many-attempts' };
    }
    return { ok: false, reason: 'wrong-answer' };
  }

  challenges.delete(challengeId);
  const payload = `${randomBytes(18).toString('base64url')}.${now + TOKEN_TTL_MS}`;
  const token = signedValue(payload);
  tokens.set(token, { expiresAt: now + TOKEN_TTL_MS, used: false });
  pruneStores(now);
  return { ok: true, token };
}

export function verifyLocalCaptcha(challengeId: string, answer: string): string | null {
  const result = verifyLocalCaptchaDetailed(challengeId, answer);
  return result.ok ? result.token : null;
}

/** Consume a local proof exactly once. */
export function consumeLocalCaptchaToken(token: string): boolean {
  const payload = validSignedValue(token);
  if (!payload) return false;

  // The in-memory record enforces single-use when both handlers share a
  // process. The signed expiry keeps the proof verifiable when Next bundles
  // the two route handlers separately (or a serverless request lands on a
  // different instance).
  const expirySeparator = payload.lastIndexOf('.');
  const expiresAt = Number(payload.slice(expirySeparator + 1));
  if (expirySeparator <= 0 || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;

  const stored = tokens.get(token);
  if (stored) {
    if (stored.used || stored.expiresAt <= Date.now()) {
      tokens.delete(token);
      return false;
    }
    stored.used = true;
  }
  return true;
}

export function isTurnstileConfigured(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

export function isRecaptchaConfigured(): boolean {
  return Boolean(process.env.RECAPTCHA_SECRET_KEY && process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY);
}

export function isHcaptchaConfigured(): boolean {
  return Boolean(process.env.HCAPTCHA_SECRET_KEY && process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY);
}

export function getAvailableCaptchaProviders(): Array<'turnstile' | 'recaptcha' | 'hcaptcha' | 'local'> {
  const providers: Array<'turnstile' | 'recaptcha' | 'hcaptcha' | 'local'> = [];
  if (isTurnstileConfigured()) providers.push('turnstile');
  if (isRecaptchaConfigured()) providers.push('recaptcha');
  if (isHcaptchaConfigured()) providers.push('hcaptcha');
  providers.push('local');
  return providers;
}

async function verifyTurnstileToken(token: string, remoteIp: string): Promise<boolean> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY as string;
  if (!secretKey) return false;
  try {
    const body = new URLSearchParams({ secret: secretKey, response: token });
    if (remoteIp && remoteIp !== 'unknown') body.set('remoteip', remoteIp);
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
}

async function verifyRecaptchaToken(token: string, remoteIp: string): Promise<boolean> {
  const secretKey = process.env.RECAPTCHA_SECRET_KEY as string;
  if (!secretKey) return false;
  try {
    const body = new URLSearchParams({ secret: secretKey, response: token });
    if (remoteIp && remoteIp !== 'unknown') body.set('remoteip', remoteIp);
    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
}

async function verifyHcaptchaToken(token: string, remoteIp: string): Promise<boolean> {
  const secretKey = process.env.HCAPTCHA_SECRET_KEY as string;
  if (!secretKey) return false;
  try {
    const body = new URLSearchParams({
      secret: secretKey,
      response: token,
      sitekey: (process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY as string) || '',
    });
    if (remoteIp && remoteIp !== 'unknown') body.set('remoteip', remoteIp);
    const response = await fetch('https://api.hcaptcha.com/siteverify', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
}

/**
 * Verify a human proof. Local fallback tokens are accepted first — they are
 * signed and single-use — so the backup CAPTCHA keeps working even when
 * Turnstile/reCAPTCHA/hCaptcha keys are configured. Anything that is not a local
 * token is then checked against the respective Siteverify endpoints.
 */
export async function verifyCaptchaToken(token: string, remoteIp: string): Promise<boolean> {
  if (!token) return false;

  // Local backup tokens must keep working when production keys are
  // present, so consume from the signed local store before the remote check.
  if (consumeLocalCaptchaToken(token)) return true;

  const checks: Array<Promise<boolean>> = [];
  if (isTurnstileConfigured()) checks.push(verifyTurnstileToken(token, remoteIp));
  if (isRecaptchaConfigured()) checks.push(verifyRecaptchaToken(token, remoteIp));
  if (isHcaptchaConfigured()) checks.push(verifyHcaptchaToken(token, remoteIp));

  if (checks.length === 0) return false;

  // Try providers in order, but in parallel for speed. Any success means the
  // human check passed; we don't need to wait for the others.
  try {
    const results = await Promise.all(checks);
    return results.some(ok => ok);
  } catch {
    return false;
  }
}
