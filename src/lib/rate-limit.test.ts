import { afterEach, describe, expect, it, vi } from 'vitest';
import { rateLimit } from './rate-limit';

describe('in-memory rateLimit', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns zero through the allowance and seconds to wait afterward', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    expect(rateLimit('test:allowance', 2)).toBe(0);
    expect(rateLimit('test:allowance', 2)).toBe(0);

    vi.advanceTimersByTime(30_100);
    expect(rateLimit('test:allowance', 2)).toBe(30);
  });

  it('starts a fresh fixed window after 60 seconds', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    expect(rateLimit('test:expiry', 1)).toBe(0);
    expect(rateLimit('test:expiry', 1)).toBe(60);

    vi.advanceTimersByTime(60_000);
    expect(rateLimit('test:expiry', 1)).toBe(0);
  });

  it('keeps endpoint-prefixed keys independent', () => {
    expect(rateLimit('captcha:test-client', 1)).toBe(0);
    expect(rateLimit('video-info:test-client', 1)).toBe(0);
    expect(rateLimit('captcha:test-client', 1)).toBeGreaterThan(0);
  });
});
