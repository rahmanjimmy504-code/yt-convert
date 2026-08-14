import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SITE_URL, getSiteUrl } from './site';

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getSiteUrl', () => {
  it('returns the Vercel fallback when no deployment URL is set', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.RENDER_EXTERNAL_URL;
    expect(getSiteUrl()).toBe(DEFAULT_SITE_URL);
  });

  it('uses Render\'s service URL when no custom domain is configured', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    vi.stubEnv('RENDER_EXTERNAL_URL', 'https://yt-convert-r8b2.onrender.com');
    expect(getSiteUrl()).toBe('https://yt-convert-r8b2.onrender.com');
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
