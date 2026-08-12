import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  extractInstagramShortcode,
  extractTikTokId,
  extractTweetId,
  innertubeFormats,
  sanitizeYouTubeCookies,
  twitterSyndicationToken,
} from './extract';

describe('id parsers', () => {
  it('extracts TikTok video ids', () => {
    expect(extractTikTokId('https://www.tiktok.com/@scout2015/video/6718335390845095173')).toBe(
      '6718335390845095173',
    );
    expect(extractTikTokId('https://www.tiktok.com/@x/video/6718335390845095173?is_copy_url=1')).toBe(
      '6718335390845095173',
    );
    expect(extractTikTokId('https://www.tiktok.com/@x')).toBeNull();
  });

  it('extracts tweet ids', () => {
    expect(extractTweetId('https://x.com/jack/status/20')).toBe('20');
    expect(extractTweetId('https://x.com/jack/status/1234567890123456789')).toBe('1234567890123456789');
    expect(extractTweetId('https://twitter.com/jack/statuses/1234567890123456789?s=20')).toBe(
      '1234567890123456789',
    );
    expect(extractTweetId('https://x.com/jack')).toBeNull();
  });

  it('extracts Instagram shortcodes', () => {
    expect(extractInstagramShortcode('https://www.instagram.com/reel/AbC123_-xy/')).toBe('AbC123_-xy');
    expect(extractInstagramShortcode('https://www.instagram.com/p/AbC123/')).toBe('AbC123');
    expect(extractInstagramShortcode('https://www.instagram.com/tv/AbC123/')).toBe('AbC123');
    expect(extractInstagramShortcode('https://www.instagram.com/user/')).toBeNull();
  });

  it('computes the public syndication token from a tweet id', () => {
    expect(twitterSyndicationToken('20')).toMatch(/^[a-z0-9]+$/);
    expect(twitterSyndicationToken('20')).toBe(twitterSyndicationToken('20'));
  });
});

describe('sanitizeYouTubeCookies', () => {
  it('returns null for empty input', () => {
    expect(sanitizeYouTubeCookies('')).toBeNull();
    expect(sanitizeYouTubeCookies('   ')).toBeNull();
  });

  it('passes through a well-formed cookie header', () => {
    const cookies = 'SAPISID=abc123; __Secure-3PAPISID=def456; HSID=ghi789';
    expect(sanitizeYouTubeCookies(cookies)).toBe(cookies);
  });

  it('strips CR/LF to prevent header injection', () => {
    expect(sanitizeYouTubeCookies('a=1;\r\nb=2')).toBe('a=1;b=2');
    expect(sanitizeYouTubeCookies('a=1\nb=2')).toBe('a=1b=2');
  });

  it('rejects input with non-printable characters', () => {
    expect(sanitizeYouTubeCookies('a=1;\x00b=2')).toBeNull();
    expect(sanitizeYouTubeCookies('a=1;\x7Fb=2')).toBeNull();
  });

  it('rejects input longer than 4 KB', () => {
    const long = 'a=' + 'x'.repeat(4100);
    expect(sanitizeYouTubeCookies(long)).toBeNull();
  });

  it('trims whitespace', () => {
    expect(sanitizeYouTubeCookies('  a=1  ')).toBe('a=1');
  });
});

describe('innertubeFormats cookie forwarding', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('forwards sanitized cookies as a Cookie header', async () => {
    const capturedHeaders: Record<string, string>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const headers = Object.fromEntries(new Headers(init.headers as HeadersInit).entries());
        capturedHeaders.push(headers);
        return new Response(
          JSON.stringify({
            playabilityStatus: { status: 'OK' },
            streamingData: {
              formats: [{ itag: 22, mimeType: 'video/mp4', url: 'https://rr1---sn-test.googlevideo.com/v' }],
              adaptiveFormats: [{ itag: 140, mimeType: 'audio/mp4', url: 'https://rr2---sn-test.googlevideo.com/a' }],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );

    await innertubeFormats('dQw4w9WgXcQ', { cookies: 'SAPISID=abc; HSID=def' });
    expect(capturedHeaders[0]['cookie']).toBe('SAPISID=abc; HSID=def');
  });

  it('does not send a Cookie header when cookies are empty or invalid', async () => {
    const capturedHeaders: Record<string, string>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const headers = Object.fromEntries(new Headers(init.headers as HeadersInit).entries());
        capturedHeaders.push(headers);
        return new Response(
          JSON.stringify({
            playabilityStatus: { status: 'OK' },
            streamingData: {
              formats: [{ itag: 22, mimeType: 'video/mp4', url: 'https://rr1---sn-test.googlevideo.com/v' }],
              adaptiveFormats: [{ itag: 140, mimeType: 'audio/mp4', url: 'https://rr2---sn-test.googlevideo.com/a' }],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );

    await innertubeFormats('dQw4w9WgXcQ', { cookies: '' });
    expect(capturedHeaders[0]['cookie']).toBeUndefined();

    capturedHeaders.length = 0;
    await innertubeFormats('dQw4w9WgXcQ', { cookies: '\x00injection' });
    expect(capturedHeaders[0]['cookie']).toBeUndefined();
  });

  it('does not send cookies when no options are passed', async () => {
    const capturedHeaders: Record<string, string>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const headers = Object.fromEntries(new Headers(init.headers as HeadersInit).entries());
        capturedHeaders.push(headers);
        return new Response(
          JSON.stringify({
            playabilityStatus: { status: 'OK' },
            streamingData: {
              formats: [{ itag: 22, mimeType: 'video/mp4', url: 'https://rr1---sn-test.googlevideo.com/v' }],
              adaptiveFormats: [{ itag: 140, mimeType: 'audio/mp4', url: 'https://rr2---sn-test.googlevideo.com/a' }],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );

    await innertubeFormats('dQw4w9WgXcQ');
    expect(capturedHeaders[0]['cookie']).toBeUndefined();
  });
});
