import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clientIp, rateLimit } from './rate-limit';

beforeEach(() => {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
  vi.stubEnv('RENDER', '');
  vi.stubEnv('VERCEL', '');
  vi.stubEnv('TRUSTED_PROXY_IP_HEADER', '');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('clientIp', () => {
  it('uses Render Cloudflare connection IP and ignores spoofable XFF input', () => {
    vi.stubEnv('RENDER', 'true');
    const request = new Request('https://example.com', {
      headers: {
        'CF-Connecting-IP': '203.0.113.8',
        'X-Forwarded-For': '198.51.100.99, 192.0.2.4',
      },
    });

    expect(clientIp(request)).toBe('203.0.113.8');
  });

  it('uses XFF on Vercel, which overwrites that header at ingress', () => {
    vi.stubEnv('VERCEL', '1');
    const request = new Request('https://example.com', {
      headers: { 'X-Forwarded-For': '198.51.100.7' },
    });

    expect(clientIp(request)).toBe('198.51.100.7');
  });

  it('uses the rightmost XFF hop when a self-hosted trusted proxy is explicit', () => {
    vi.stubEnv('TRUSTED_PROXY_IP_HEADER', 'x-forwarded-for');
    const request = new Request('https://example.com', {
      headers: { 'X-Forwarded-For': '198.51.100.99, 203.0.113.8' },
    });

    expect(clientIp(request)).toBe('203.0.113.8');
  });

  it('does not trust arbitrary headers without a configured ingress boundary', () => {
    const request = new Request('https://example.com', {
      headers: {
        'CF-Connecting-IP': '203.0.113.8',
        'X-Forwarded-For': '198.51.100.7',
        'X-Real-IP': '192.0.2.4',
      },
    });

    expect(clientIp(request)).toBe('unknown');
  });

  it('rejects malformed trusted header values', () => {
    vi.stubEnv('RENDER', 'true');
    expect(clientIp(new Request('https://example.com', {
      headers: { 'CF-Connecting-IP': 'not-an-ip' },
    }))).toBe('unknown');
  });
});

describe('in-memory rateLimit', () => {
  it('returns zero through the allowance and seconds to wait afterward', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    await expect(rateLimit('test:allowance', 2)).resolves.toBe(0);
    await expect(rateLimit('test:allowance', 2)).resolves.toBe(0);

    vi.advanceTimersByTime(30_100);
    await expect(rateLimit('test:allowance', 2)).resolves.toBe(30);
  });

  it('starts a fresh fixed window after 60 seconds', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    await expect(rateLimit('test:expiry', 1)).resolves.toBe(0);
    await expect(rateLimit('test:expiry', 1)).resolves.toBe(60);

    vi.advanceTimersByTime(60_000);
    await expect(rateLimit('test:expiry', 1)).resolves.toBe(0);
  });

  it('keeps endpoint-prefixed keys independent', async () => {
    await expect(rateLimit('captcha:test-client', 1)).resolves.toBe(0);
    await expect(rateLimit('video-info:test-client', 1)).resolves.toBe(0);
    await expect(rateLimit('captcha:test-client', 1)).resolves.toBeGreaterThan(0);
  });
});

describe('Upstash Redis rateLimit', () => {
  beforeEach(() => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io/');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token');
  });

  it('atomically increments and expires only the first hit', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ result: [3, 27] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(rateLimit('convert:203.0.113.9', 2)).resolves.toBe(27);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.upstash.io');
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
    });

    const command = JSON.parse(String(init?.body)) as string[];
    expect(command[0]).toBe('EVAL');
    expect(command[1]).toContain('redis.call("INCR"');
    expect(command[1]).toContain('if count == 1');
    expect(command[1]).toContain('redis.call("EXPIRE"');
    expect(command[2]).toBe('1');
    expect(command[3]).toMatch(/^yt-convert:rate-limit:v1:[a-f0-9]{64}$/);
    expect(command[3]).not.toContain('203.0.113.9');
    expect(command[4]).toBe('60');
  });

  it('allows requests while the shared store is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Redis unavailable'));

    await expect(rateLimit('convert:unreachable', 0)).resolves.toBe(0);
  });

  it('times out quickly and allows the request when the store is slow', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    });

    const result = rateLimit('convert:slow', 0);
    await vi.advanceTimersByTimeAsync(500);

    await expect(result).resolves.toBe(0);
  });
});
