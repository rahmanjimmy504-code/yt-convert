import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  extractInstagramShortcode,
  extractMedia,
  extractTikTokId,
  extractTweetId,
  innertubeFormats,
  isBotChallenge,
  isExtractError,
  playabilityMessage,
  sanitizeYouTubeCookies,
  twitterSyndicationToken,
} from './extract';
import { __resetPoTokenCacheForTests } from './po-token';

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

describe('extractMedia YouTube fallbacks', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const GV_VIDEO = 'https://rr1---sn-test.googlevideo.com/videoplayback?id=v';
  const GV_AUDIO = 'https://rr2---sn-test.googlevideo.com/videoplayback?id=a';
  const PIPED_VIDEO = 'https://pipedproxy-bom.kavin.rocks/videoplayback?id=v';
  const PIPED_AUDIO = 'https://pipedproxy-bom.kavin.rocks/videoplayback?id=a';

  function playerOk(videoUrl: string, audioUrl: string) {
    return {
      playabilityStatus: { status: 'OK' },
      streamingData: {
        formats: [{ itag: 22, mimeType: 'video/mp4', url: videoUrl, height: 720, audioQuality: 'AUDIO_QUALITY_MEDIUM' }],
        adaptiveFormats: [{ itag: 140, mimeType: 'audio/mp4', url: audioUrl, bitrate: 128_000 }],
      },
    };
  }

  function emptyPlayer() {
    return { playabilityStatus: { status: 'OK' }, streamingData: {} };
  }

  function pipedOk(videoUrl: string, audioUrl: string) {
    return {
      audioStreams: [{ mimeType: 'audio/mp4', codec: 'mp4a.40.2', bitrate: 128_000, url: audioUrl }],
      videoStreams: [{ mimeType: 'video/mp4', codec: 'avc1.64001F', height: 720, bitrate: 2_500_000, url: videoUrl }],
    };
  }

  it('uses Innertube directly when it returns streams (no Piped hop)', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url);
        return new Response(JSON.stringify(playerOk(GV_VIDEO, GV_AUDIO)), {
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const result = await extractMedia('youtube', 'https://www.youtube.com/watch?v=Y1Z3Q3O7IRE', 'mp4', 'best');
    expect(isExtractError(result)).toBe(false);
    if (!isExtractError(result)) {
      expect(result.url).toBe(GV_VIDEO);
    }
    // No pipedapi.* host should have been contacted.
    expect(urls.some(u => u.includes('pipedapi'))).toBe(false);
  });

  it('falls back to Piped when Innertube and Invidious return nothing', async () => {
    const contacted: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        contacted.push(url);
        // Innertube player + Invidious both answer but with no streams.
        if (url.includes('youtubei/v1/player')) {
          return new Response(JSON.stringify(emptyPlayer()), { headers: { 'Content-Type': 'application/json' } });
        }
        if (url.includes('/api/v1/videos/')) {
          return new Response(JSON.stringify({}), { headers: { 'Content-Type': 'application/json' } });
        }
        // Piped answer.
        if (url.includes('pipedapi')) {
          return new Response(JSON.stringify(pipedOk(PIPED_VIDEO, PIPED_AUDIO)), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('{}', { status: 404 });
      }),
    );
    const result = await extractMedia('youtube', 'https://www.youtube.com/watch?v=Y1Z3Q3O7IRE', 'mp4', 'best');
    expect(isExtractError(result)).toBe(false);
    if (!isExtractError(result)) {
      expect(result.url).toBe(PIPED_VIDEO);
      expect(result.note).toMatch(/piped/i);
    }
    expect(contacted.some(u => u.includes('pipedapi'))).toBe(true);
  });

  it('returns a clear music-label / copyright error when Piped reports one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('youtubei/v1/player')) {
          return new Response(JSON.stringify(emptyPlayer()), { headers: { 'Content-Type': 'application/json' } });
        }
        if (url.includes('pipedapi')) {
          return new Response(
            JSON.stringify({ error: 'This video contains content from a music label, blocked in your country' }),
            { headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response('{}', { status: 404 });
      }),
    );
    const result = await extractMedia('youtube', 'https://www.youtube.com/watch?v=Y1Z3Q3O7IRE', 'mp4', 'best');
    expect(isExtractError(result)).toBe(true);
    if (isExtractError(result)) {
      expect(result.error).toMatch(/music label|copyright/i);
      expect(result.error).toMatch(/try a converter below/i);
    }
  });

  it('reports an age-restriction message when every client returns LOGIN_REQUIRED', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('youtubei/v1/player')) {
          return new Response(
            JSON.stringify({ playabilityStatus: { status: 'LOGIN_REQUIRED', reason: 'Sign in to confirm your age' } }),
            { headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response('{}', { status: 404 });
      }),
    );
    const result = await extractMedia('youtube', 'https://www.youtube.com/watch?v=Y1Z3Q3O7IRE', 'mp4', 'best');
    expect(isExtractError(result)).toBe(true);
    if (isExtractError(result)) {
      expect(result.error).toMatch(/age-restricted|signed-in account/i);
    }
  });
});

describe('isBotChallenge / playabilityMessage', () => {
  it('detects the BotGuard IP challenge behind LOGIN_REQUIRED', () => {
    expect(isBotChallenge('LOGIN_REQUIRED', "Sign in to confirm you're not a bot")).toBe(true);
    expect(isBotChallenge('LOGIN_REQUIRED', 'Sign in to confirm you’re not a bot')).toBe(true);
    expect(isBotChallenge('ERROR', 'We have detected unusual traffic from your network')).toBe(true);
  });

  it('does not mistake a real age gate for a bot check', () => {
    expect(isBotChallenge('LOGIN_REQUIRED', 'Sign in to confirm your age')).toBe(false);
    expect(isBotChallenge('LOGIN_REQUIRED', undefined)).toBe(false);
    expect(isBotChallenge('AGE_VERIFICATION_REQUIRED', 'This video may be inappropriate')).toBe(false);
  });

  it('reports a bot check honestly instead of "age-restricted or private"', () => {
    const msg = playabilityMessage('LOGIN_REQUIRED', "Sign in to confirm you're not a bot");
    expect(msg).toMatch(/bot check/i);
    expect(msg).not.toMatch(/age-restricted/i);
    expect(msg).toMatch(/po-token server/i);
  });

  it('says so when a sidecar is configured but did not clear the challenge', () => {
    const msg = playabilityMessage('LOGIN_REQUIRED', "Sign in to confirm you're not a bot", true);
    expect(msg).toMatch(/did not clear it/i);
  });

  it('still reports genuine age gates as before', () => {
    expect(playabilityMessage('LOGIN_REQUIRED', 'Sign in to confirm your age')).toMatch(
      /age-restricted or private/i,
    );
  });
});

describe('PO-token bot-challenge retry', () => {
  const SAVED = { ...process.env };

  afterEach(() => {
    process.env = { ...SAVED };
    vi.unstubAllGlobals();
    __resetPoTokenCacheForTests();
  });

  function botWall() {
    return new Response(
      JSON.stringify({
        playabilityStatus: { status: 'LOGIN_REQUIRED', reason: "Sign in to confirm you're not a bot" },
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  it('retries the player request once with a freshly minted token', async () => {
    process.env.PO_TOKEN_SERVER_URL = 'https://token.example';
    process.env.PO_TOKEN_SERVER_AUTH = 'secret';
    let tokenCalls = 0;
    const playerBodies: string[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.startsWith('https://token.example')) {
          tokenCalls += 1;
          return new Response(
            JSON.stringify({ visitorData: `VD${tokenCalls}`, poToken: `POT${tokenCalls}` }),
            { headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (url.includes('youtubei/v1/player')) {
          playerBodies.push(String(init?.body ?? ''));
          return botWall();
        }
        return new Response('{}', { status: 404 });
      }),
    );

    await extractMedia('youtube', 'https://www.youtube.com/watch?v=Y1Z3Q3O7IRE', 'mp4', 'best');

    // Two token fetches: the up-front one and the forced refresh.
    expect(tokenCalls).toBe(2);
    expect(playerBodies.some(b => b.includes('POT1'))).toBe(true);
    expect(playerBodies.some(b => b.includes('POT2'))).toBe(true);
  });

  it('does not retry when no PO-token server is configured', async () => {
    let tokenCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.startsWith('https://token.example')) {
          tokenCalls += 1;
          return new Response('{}', { status: 500 });
        }
        if (url.includes('youtubei/v1/player')) return botWall();
        return new Response('{}', { status: 404 });
      }),
    );

    const result = await extractMedia('youtube', 'https://www.youtube.com/watch?v=Y1Z3Q3O7IRE', 'mp4', 'best');
    expect(tokenCalls).toBe(0);
    expect(isExtractError(result)).toBe(true);
    if (isExtractError(result)) expect(result.error).toMatch(/bot check/i);
  });
});

describe('cobalt last-resort fallback through extractMedia', () => {
  const SAVED = { ...process.env };

  afterEach(() => {
    process.env = { ...SAVED };
    vi.unstubAllGlobals();
  });

  /** Every upstream source (Innertube/Invidious/Piped) returns nothing. */
  function stubDeadUpstreams(cobaltPayload: unknown) {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url.startsWith('https://cobalt.example.com')) {
          return new Response(JSON.stringify(cobaltPayload), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('{}', { status: 404 });
      }),
    );
    return calls;
  }

  it('serves an mp3 from a cobalt tunnel when everything else is empty', async () => {
    process.env.COBALT_API_URL = 'https://cobalt.example.com';
    process.env.COBALT_PROXY_HOSTS = 'cobalt.example.com';
    stubDeadUpstreams({ status: 'tunnel', url: 'https://cobalt.example.com/tunnel?id=1' });

    const result = await extractMedia('youtube', 'https://www.youtube.com/watch?v=Y1Z3Q3O7IRE', 'mp3', 'best');
    expect(isExtractError(result)).toBe(false);
    if (!isExtractError(result)) {
      expect(result.url).toBe('https://cobalt.example.com/tunnel?id=1');
      expect(result.mimeType).toBe('audio/mpeg');
      expect(result.extension).toBe('mp3');
    }
  });

  it('serves an mp4 from a cobalt tunnel', async () => {
    process.env.COBALT_API_URL = 'https://cobalt.example.com';
    process.env.COBALT_PROXY_HOSTS = 'cobalt.example.com';
    stubDeadUpstreams({ status: 'tunnel', url: 'https://cobalt.example.com/tunnel?id=2' });

    const result = await extractMedia('youtube', 'https://www.youtube.com/watch?v=Y1Z3Q3O7IRE', 'mp4', 'best');
    expect(isExtractError(result)).toBe(false);
    if (!isExtractError(result)) expect(result.mimeType).toBe('video/mp4');
  });

  it('refuses a cobalt URL that is not on the media allowlist', async () => {
    process.env.COBALT_API_URL = 'https://cobalt.example.com';
    delete process.env.COBALT_PROXY_HOSTS;
    stubDeadUpstreams({ status: 'tunnel', url: 'https://evil.example/tunnel?id=3' });

    const result = await extractMedia('youtube', 'https://www.youtube.com/watch?v=Y1Z3Q3O7IRE', 'mp4', 'best');
    expect(isExtractError(result)).toBe(true);
  });

  it('surfaces a cobalt refusal code in the error message', async () => {
    process.env.COBALT_API_URL = 'https://cobalt.example.com';
    stubDeadUpstreams({ status: 'error', error: { code: 'error.api.youtube.login' } });

    const result = await extractMedia('youtube', 'https://www.youtube.com/watch?v=Y1Z3Q3O7IRE', 'mp4', 'best');
    expect(isExtractError(result)).toBe(true);
    if (isExtractError(result)) expect(result.error).toMatch(/error\.api\.youtube\.login/);
  });

  it('is never called when COBALT_API_URL is unset', async () => {
    delete process.env.COBALT_API_URL;
    const calls = stubDeadUpstreams({ status: 'tunnel', url: 'https://cobalt.example.com/x' });

    await extractMedia('youtube', 'https://www.youtube.com/watch?v=Y1Z3Q3O7IRE', 'mp4', 'best');
    expect(calls.some(u => u.startsWith('https://cobalt.example.com'))).toBe(false);
  });
});
