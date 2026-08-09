import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SITE_URL, getSiteUrl } from './site';

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getSiteUrl', () => {
  it('returns the Vercel fallback when NEXT_PUBLIC_SITE_URL is unset', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(getSiteUrl()).toBe(DEFAULT_SITE_URL);
  });

  it('returns the custom production domain when configured', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://yt-convert.example.com');
    expect(getSiteUrl()).toBe('https://yt-convert.example.com');
  });

  it('strips trailing slashes', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://yt-convert.example.com///');
    expect(getSiteUrl()).toBe('https://yt-convert.example.com');
  });
});
