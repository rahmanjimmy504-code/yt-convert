import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

/**
 * Contract tests for `GET /api/captcha`.
 *
 * The `provider` this endpoint reports is what decides whether the client
 * renders the Turnstile widget or the dependency-free local challenge — and it
 * is the exact value a deployer probes to check a Cloudflare Workers
 * installation. It used to require the Turnstile *site key* at request time,
 * which the deploy workflow never uploads (the site key is a build-time
 * NEXT_PUBLIC_* value inlined into the web bundle). The server therefore
 * answered `provider: local` on Workers forever, every completed Turnstile
 * check was rejected with a 403, and the widget reset in a loop.
 *
 * These tests drive the real route handler with only the values a Workers
 * deploy actually provides.
 */

const TURNSTILE_SECRET = 'test-turnstile-secret';

/** Distinct client IPs keep the per-IP rate limiter from bleeding across tests. */
let requestCounter = 0;

function request(search = ''): Request {
  requestCounter += 1;
  return new Request(`http://localhost/api/captcha${search}`, {
    headers: { 'x-forwarded-for': `203.0.113.${requestCounter}` },
  });
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/captcha', () => {
  it('reports turnstile when only the secret key is deployed', async () => {
    // This is the production situation on Cloudflare Workers: the deploy
    // uploads TURNSTILE_SECRET_KEY, and the site key exists only inside the
    // already-built client bundle.
    vi.stubEnv('TURNSTILE_SECRET_KEY', TURNSTILE_SECRET);
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '');

    const response = await GET(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ provider: 'turnstile' });
  });

  it('reports local and mints a challenge when no CAPTCHA provider is configured', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '');

    const response = await GET(request());
    expect(response.status).toBe(200);

    const body = (await response.json()) as { provider: string; challengeId?: string };
    expect(body.provider).toBe('local');
    expect(body.challengeId).toBeTruthy();
  });

  it('still serves the local backup challenge on ?backup=1 when Turnstile is configured', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', TURNSTILE_SECRET);
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '');

    const response = await GET(request('?backup=1'));
    expect(response.status).toBe(200);

    const body = (await response.json()) as { provider: string; challengeId?: string };
    expect(body.provider).toBe('local');
    expect(body.challengeId).toBeTruthy();
  });
});
