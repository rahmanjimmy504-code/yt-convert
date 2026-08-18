import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  consumeLocalCaptchaToken,
  createLocalCaptcha,
  isTurnstileConfigured,
  verifyCaptchaToken,
  verifyLocalCaptcha,
  verifyLocalCaptchaDetailed,
} from './captcha';

const TURNSTILE_SECRET = 'test-turnstile-secret';
const TURNSTILE_SITE_KEY = 'test-turnstile-site-key';

function mathAnswer(question: string): string {
  const match = question.match(/(\d+) \+ (\d+)/);
  if (!match) throw new Error(`Unexpected math question: ${question}`);
  return String(Number(match[1]) + Number(match[2]));
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('createLocalCaptcha', () => {
  it('creates a visual challenge with a challenge id and image', () => {
    const challenge = createLocalCaptcha('visual');
    expect(challenge.challengeId).toBeTruthy();
    expect(challenge.mode).toBe('visual');
    expect(challenge.image).toContain('<svg');
    expect(challenge.question).toBeUndefined();
  });

  it('creates a math challenge with a solvable question', () => {
    const challenge = createLocalCaptcha('math');
    expect(challenge.mode).toBe('math');
    expect(challenge.question).toMatch(/What is \d+ \+ \d+\?/);
    expect(challenge.image).toBeUndefined();
    expect(Number.isFinite(Number(mathAnswer(challenge.question as string)))).toBe(true);
  });

  it('defaults to the visual mode', () => {
    expect(createLocalCaptcha().mode).toBe('visual');
  });
});

describe('verifyLocalCaptchaDetailed', () => {
  it('mints a token for a correct math answer', () => {
    const challenge = createLocalCaptcha('math');
    const result = verifyLocalCaptchaDetailed(challenge.challengeId, mathAnswer(challenge.question as string));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.token.length).toBeGreaterThan(0);
  });

  it('accepts whitespace and case in answers', () => {
    const challenge = createLocalCaptcha('math');
    const answer = `  ${mathAnswer(challenge.question as string)}  `;
    expect(verifyLocalCaptchaDetailed(challenge.challengeId, answer).ok).toBe(true);
  });

  it('rejects a wrong answer with the wrong-answer reason', () => {
    const challenge = createLocalCaptcha('math');
    const result = verifyLocalCaptchaDetailed(challenge.challengeId, '999');
    expect(result).toEqual({ ok: false, reason: 'wrong-answer' });
  });

  it('reports missing for an unknown challenge id', () => {
    expect(verifyLocalCaptchaDetailed('does-not-exist', 'a').ok).toBe(false);
  });

  it('reports expired for a challenge older than its TTL', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const challenge = createLocalCaptcha('math');
    vi.setSystemTime(new Date('2026-01-01T00:06:00Z'));
    expect(verifyLocalCaptchaDetailed(challenge.challengeId, '42')).toEqual({ ok: false, reason: 'expired' });
  });

  it('locks the challenge after the maximum number of attempts', () => {
    const challenge = createLocalCaptcha('math');
    for (let i = 0; i < 4; i += 1) {
      expect(verifyLocalCaptchaDetailed(challenge.challengeId, '999')).toEqual({ ok: false, reason: 'wrong-answer' });
    }
    expect(verifyLocalCaptchaDetailed(challenge.challengeId, '999')).toEqual({ ok: false, reason: 'too-many-attempts' });
    // The locked challenge is removed, so further attempts report it as missing.
    expect(verifyLocalCaptchaDetailed(challenge.challengeId, '999')).toEqual({ ok: false, reason: 'missing' });
  });

  it('still accepts the correct answer on the last allowed attempt', () => {
    const challenge = createLocalCaptcha('math');
    for (let i = 0; i < 4; i += 1) {
      verifyLocalCaptchaDetailed(challenge.challengeId, '999');
    }
    const result = verifyLocalCaptchaDetailed(challenge.challengeId, mathAnswer(challenge.question as string));
    expect(result.ok).toBe(true);
  });
});

describe('stateless challenges (multi-isolate deployments)', () => {
  // On Cloudflare Workers / serverless, GET /api/captcha and POST /api/captcha
  // routinely land on different isolates, which do not share module memory.
  // A fresh module instance stands in for "another isolate".
  async function otherIsolate() {
    vi.resetModules();
    return import('./captcha');
  }

  it('verifies a challenge minted by another isolate', async () => {
    const challenge = createLocalCaptcha('math');
    const answer = mathAnswer(challenge.question as string);

    const remote = await otherIsolate();
    const result = remote.verifyLocalCaptchaDetailed(challenge.challengeId, answer);

    expect(result.ok).toBe(true);
  });

  it('lets a third isolate consume the token minted by the second', async () => {
    const challenge = createLocalCaptcha('math');
    const answer = mathAnswer(challenge.question as string);

    const verifier = await otherIsolate();
    const result = verifier.verifyLocalCaptchaDetailed(challenge.challengeId, answer);
    if (!result.ok) throw new Error('expected a token');

    const consumer = await otherIsolate();
    expect(consumer.consumeLocalCaptchaToken(result.token)).toBe(true);
  });

  it('still rejects a wrong answer on another isolate', async () => {
    const challenge = createLocalCaptcha('math');
    const remote = await otherIsolate();
    expect(remote.verifyLocalCaptchaDetailed(challenge.challengeId, '999')).toEqual({
      ok: false,
      reason: 'wrong-answer',
    });
  });

  it('rejects a forged or tampered challenge id', async () => {
    const challenge = createLocalCaptcha('math');
    const answer = mathAnswer(challenge.question as string);
    const remote = await otherIsolate();

    expect(remote.verifyLocalCaptchaDetailed('not-a-signed-id', answer).ok).toBe(false);

    // Flip a character in the signature: the id must no longer validate.
    const separator = challenge.challengeId.lastIndexOf('.');
    const body = challenge.challengeId.slice(0, separator);
    const signature = challenge.challengeId.slice(separator + 1);
    const tampered = `${body}.${(signature[0] === 'A' ? 'B' : 'A')}${signature.slice(1)}`;
    expect(remote.verifyLocalCaptchaDetailed(tampered, answer).ok).toBe(false);
  });

  it('does not leak the answer in the challenge id', () => {
    // The visual code is the meaningful secret (a short math sum would match
    // the timestamp digits by chance, so it is not a useful assertion).
    const visual = createLocalCaptcha('visual');
    const code = ((visual.image as string).match(/>([A-Z2-9])<\/text>/g) ?? [])
      .map(tag => tag.replace(/[^A-Z2-9]/g, ''))
      .join('');
    expect(code).toHaveLength(5);
    expect(visual.challengeId).not.toContain(code);
    // The id carries only an HMAC of the answer, so a second challenge with the
    // same answer still gets a different id.
    expect(visual.challengeId).not.toBe(createLocalCaptcha('visual').challengeId);
  });

  it('honours the expiry carried in the signed id on another isolate', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const challenge = createLocalCaptcha('math');
    const answer = mathAnswer(challenge.question as string);
    vi.setSystemTime(new Date('2026-01-01T00:06:00Z'));

    const remote = await otherIsolate();
    expect(remote.verifyLocalCaptchaDetailed(challenge.challengeId, answer)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('reads CAPTCHA_SECRET lazily, not at module load', async () => {
    // On Workers a module is evaluated before the request context exists, so
    // process.env.CAPTCHA_SECRET is empty at import time and only appears once
    // a request is handled. A secret captured at module load would therefore
    // never be consulted. Simulate an isolate booting with no env, then the
    // secret arriving afterwards.
    vi.stubEnv('CAPTCHA_SECRET', '');
    delete (globalThis as any).__ytConvertCaptchaSecret;
    vi.resetModules();
    const firstIsolate = await import('./captcha');

    // The secret is present by the time the challenge is minted.
    vi.stubEnv('CAPTCHA_SECRET', 'lazy-secret');
    const challenge = firstIsolate.createLocalCaptcha('math');
    const answer = mathAnswer(challenge.question as string);

    // A second isolate boots the same way (no env at module load), then sees
    // the same secret. It must be able to verify the first isolate's challenge.
    vi.stubEnv('CAPTCHA_SECRET', '');
    delete (globalThis as any).__ytConvertCaptchaSecret;
    vi.resetModules();
    const secondIsolate = await import('./captcha');
    vi.stubEnv('CAPTCHA_SECRET', 'lazy-secret');

    expect(secondIsolate.verifyLocalCaptchaDetailed(challenge.challengeId, answer).ok).toBe(true);
  });

  it('rejects a challenge signed with a different secret', async () => {
    vi.stubEnv('CAPTCHA_SECRET', 'secret-one');
    delete (globalThis as any).__ytConvertCaptchaSecret;
    vi.resetModules();
    const firstIsolate = await import('./captcha');
    const challenge = firstIsolate.createLocalCaptcha('math');
    const answer = mathAnswer(challenge.question as string);

    // A second isolate with a different secret must not verify the challenge.
    vi.stubEnv('CAPTCHA_SECRET', 'secret-two');
    delete (globalThis as any).__ytConvertCaptchaSecret;
    vi.resetModules();
    const secondIsolate = await import('./captcha');

    expect(secondIsolate.verifyLocalCaptchaDetailed(challenge.challengeId, answer).ok).toBe(false);
  });
});

describe('verifyLocalCaptcha (convenience wrapper)', () => {
  it('returns the token string on success and null otherwise', () => {
    const challenge = createLocalCaptcha('math');
    const token = verifyLocalCaptcha(challenge.challengeId, mathAnswer(challenge.question as string));
    expect(typeof token).toBe('string');
    expect(verifyLocalCaptcha(challenge.challengeId, '999')).toBeNull();
  });
});

describe('consumeLocalCaptchaToken', () => {
  function mintToken(): string {
    const challenge = createLocalCaptcha('math');
    const token = verifyLocalCaptcha(challenge.challengeId, mathAnswer(challenge.question as string));
    if (!token) throw new Error('Failed to mint a token');
    return token;
  }

  it('accepts a valid token once and rejects reuse', () => {
    const token = mintToken();
    expect(consumeLocalCaptchaToken(token)).toBe(true);
    expect(consumeLocalCaptchaToken(token)).toBe(false);
  });

  it('rejects a tampered token', () => {
    const token = mintToken();
    const separator = token.lastIndexOf('.');
    const payload = token.slice(0, separator);
    const signature = token.slice(separator + 1);
    const flipped = (payload[0] === 'A' ? 'B' : 'A') + payload.slice(1);
    expect(consumeLocalCaptchaToken(`${flipped}.${signature}`)).toBe(false);
  });

  it('rejects an expired token', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const token = mintToken();
    vi.setSystemTime(new Date('2026-01-01T00:11:00Z'));
    expect(consumeLocalCaptchaToken(token)).toBe(false);
  });

  it('rejects garbage and empty input', () => {
    expect(consumeLocalCaptchaToken('')).toBe(false);
    expect(consumeLocalCaptchaToken('not-a-token')).toBe(false);
    expect(consumeLocalCaptchaToken('a.b.c')).toBe(false);
  });
});

describe('isTurnstileConfigured', () => {
  it('requires both the secret and the site key', () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '');
    expect(isTurnstileConfigured()).toBe(false);

    vi.stubEnv('TURNSTILE_SECRET_KEY', TURNSTILE_SECRET);
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '');
    expect(isTurnstileConfigured()).toBe(false);

    vi.stubEnv('TURNSTILE_SECRET_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', TURNSTILE_SITE_KEY);
    expect(isTurnstileConfigured()).toBe(false);

    vi.stubEnv('TURNSTILE_SECRET_KEY', TURNSTILE_SECRET);
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', TURNSTILE_SITE_KEY);
    expect(isTurnstileConfigured()).toBe(true);
  });
});

describe('verifyCaptchaToken', () => {
  function mintToken(): string {
    const challenge = createLocalCaptcha('math');
    const token = verifyLocalCaptcha(challenge.challengeId, mathAnswer(challenge.question as string));
    if (!token) throw new Error('Failed to mint a token');
    return token;
  }

  it('rejects an empty token', async () => {
    await expect(verifyCaptchaToken('', '1.2.3.4')).resolves.toBe(false);
  });

  it('accepts a local token when Turnstile is not configured', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '');
    await expect(verifyCaptchaToken(mintToken(), '1.2.3.4')).resolves.toBe(true);
  });

  it('rejects a garbage token when Turnstile is not configured', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '');
    await expect(verifyCaptchaToken('garbage-token', '1.2.3.4')).resolves.toBe(false);
  });

  it('accepts a local backup token even when Turnstile keys are configured', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', TURNSTILE_SECRET);
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', TURNSTILE_SITE_KEY);
    const token = mintToken();
    await expect(verifyCaptchaToken(token, '1.2.3.4')).resolves.toBe(true);
    // The backup token is still single-use.
    await expect(verifyCaptchaToken(token, '1.2.3.4')).resolves.toBe(false);
  });

  it('verifies a Turnstile token against Siteverify when configured', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', TURNSTILE_SECRET);
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', TURNSTILE_SITE_KEY);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(verifyCaptchaToken('cf-turnstile-token', '1.2.3.4')).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; body: URLSearchParams }];
    expect(url).toContain('challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(init.method).toBe('POST');
    expect(init.body.get('secret')).toBe(TURNSTILE_SECRET);
    expect(init.body.get('response')).toBe('cf-turnstile-token');
  });

  it('rejects when Siteverify reports failure', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', TURNSTILE_SECRET);
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', TURNSTILE_SITE_KEY);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: false }) }));
    await expect(verifyCaptchaToken('cf-turnstile-token', '1.2.3.4')).resolves.toBe(false);
  });

  it('rejects when Siteverify errors', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', TURNSTILE_SECRET);
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', TURNSTILE_SITE_KEY);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(verifyCaptchaToken('cf-turnstile-token', '1.2.3.4')).resolves.toBe(false);
  });
});
