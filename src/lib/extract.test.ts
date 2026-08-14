import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachMediaUrlToken,
  extractInstagramShortcode,
  extractMedia,
  extractTikTokId,
  extractTweetId,
  innertubeFormats,
  isBotChallenge,
  isExtractError,
  playabilityMessage,
  sanitizeYouTubeCookies,
  withFallbackHint,
  twitterSyndicationToken,
} from './extract';
import { __resetPoTokenCacheForTests } from './po-token';
import { resetCobaltDirectoryCache } from './cobalt-directory';

/** Minimal 24-byte MP4 (ftyp=isom) for probes. */
function fakeMp4Body(): Uint8Array {
  // 32-byte minimal ISO-BMFF ftyp box.
  const bytes = new Uint8Array(32);
  const dv = new DataView(bytes.buffer);
  dv.setUint32(0, 0x20);
  bytes.set(new TextEncoder().encode('ftyp'), 4);
  bytes.set(new TextEncoder().encode('isom'), 8);
  dv.setUint32(12, 0x200);
  bytes.set(new TextEncoder().encode('isomavc1mp41dash'), 16);
  return bytes;
}

function streamingMp4Response(headers: Record<string, string> = {}): Response {
  const body = fakeMp4Body();
  return new Response(body as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(body.length),
      ...headers,
    },
  });
}

/** Minimal MP3 body: ID3 header then a valid MPEG frame sync. */
function fakeMp3Body(): Uint8Array {
  const bytes = new Uint8Array(256);
  bytes.set(new TextEncoder().encode('ID3'), 0);
  bytes[3] = 0x03; bytes[4] = 0x00; // ID3v2.3, no flags
  // zero size
  // MPEG1 Layer III frame sync at offset 10
  bytes[10] = 0xff;
  bytes[11] = 0xfb; // sync + MPEG1 + LayerIII + no CRC
  return bytes;
}

function streamingMp3Response(headers: Record<string, string> = {}): Response {
  const body = fakeMp3Body();
  return new Response(body as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(body.length),
      ...headers,
    },
  });
}

describe('attachMediaUrlToken', () => {
  it('appends pot to googlevideo URLs only', () => {
    const pot = 'Mmjb9zC7RXJtz9vL00XCYxJie5NonEefv5jAsItnbjBeUCwwgD4MpibO3o6lDesALHIKU7WgElG';
    const gv = attachMediaUrlToken('https://rr1---sn-test.googlevideo.com/videoplayback?id=1', pot);
    expect(gv).toContain('pot=');
    expect(gv).toContain('potc=1');
    expect(attachMediaUrlToken('https://pipedproxy-bom.kavin.rocks/v', pot)).not.toContain('pot=');
  });
});

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

  it('uses the 9Convert/dlsrv farm after mirrors and before cobalt', async () => {
    const contacted: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        contacted.push(url);
        const method = (init?.method || 'GET').toUpperCase();
        if (url.includes('youtubei/v1/player')) {
          return new Response(JSON.stringify(emptyPlayer()), { headers: { 'Content-Type': 'application/json' } });
        }
        if (url === 'https://embed.dlsrv.online/api/info' && method === 'POST') {
          return new Response(JSON.stringify({
            status: 'info',
            info: { formats: [{ type: 'video', format: 'mp4', quality: '720p' }] },
          }), { headers: { 'Content-Type': 'application/json' } });
        }
        if (url === 'https://embed.dlsrv.online/api/download/mp4' && method === 'POST') {
          return new Response(JSON.stringify({ url: 'https://media.embed.dlsrv.online/video.mp4' }), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url === 'https://media.embed.dlsrv.online/video.mp4' && method === 'GET') {
          return streamingMp4Response();
        }
        return new Response('{}', { status: 404 });
      }),
    );

    const result = await extractMedia('youtube', 'https://www.youtube.com/watch?v=Y1Z3Q3O7IRE', 'mp4', '720');
    expect(isExtractError(result)).toBe(false);
    if (!isExtractError(result)) {
      expect(result.url).toBe('https://media.embed.dlsrv.online/video.mp4');
      expect(result.note).toMatch(/9Convert/i);
    }
    expect(contacted.some(url => url.includes('piped'))).toBe(true);
    expect(contacted).toContain('https://embed.dlsrv.online/api/download/mp4');
    expect(contacted.some(url => url.startsWith('https://cobalt.'))).toBe(false);
  });

  it('skips direct googlevideo URLs and Piped/Invidious when the IP is bot-challenged, falls through to 9Convert', async () => {
    const contacted: string[] = [];
    let callCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        contacted.push(url);
        const method = (init?.method || 'GET').toUpperCase();
        if (url.includes('youtubei/v1/player')) {
          callCount += 1;
          if (callCount === 1) {
            return new Response(
              JSON.stringify({
                playabilityStatus: {
                  status: 'LOGIN_REQUIRED',
                  reason: "Sign in to confirm you're not a bot",
                },
              }),
              { headers: { 'Content-Type': 'application/json' } },
            );
          }
          return new Response(JSON.stringify(playerOk(GV_VIDEO, GV_AUDIO)), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url === 'https://embed.dlsrv.online/api/info' && method === 'POST') {
          return new Response(
            JSON.stringify({
              status: 'info',
              info: { formats: [{ type: 'video', format: 'mp4', quality: '720p' }] },
            }),
            { headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (url === 'https://embed.dlsrv.online/api/download/mp4' && method === 'POST') {
          return new Response(JSON.stringify({ url: 'https://media.embed.dlsrv.online/video.mp4' }), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url === 'https://media.embed.dlsrv.online/video.mp4' && method === 'GET') {
          return streamingMp4Response();
        }
        return new Response('{}', { status: 404 });
      }),
    );

    const result = await extractMedia('youtube', 'https://www.youtube.com/watch?v=Y1Z3Q3O7IRE', 'mp4', '720');
    expect(isExtractError(result)).toBe(false);
    if (!isExtractError(result)) {
      expect(result.url).toBe('https://media.embed.dlsrv.online/video.mp4');
      expect(result.note).toMatch(/9Convert/i);
    }
    expect(contacted.some(url => url.includes('piped'))).toBe(false);
    expect(contacted.some(url => url.includes('/api/v1/videos/'))).toBe(false);
    expect(contacted).toContain('https://embed.dlsrv.online/api/download/mp4');
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

  it('reports a bot check honestly and sends visitors to 9Convert', () => {
    const msg = playabilityMessage('LOGIN_REQUIRED', "Sign in to confirm you're not a bot");
    expect(msg).toMatch(/bot check/i);
    expect(msg).not.toMatch(/age-restricted/i);
    expect(msg).toMatch(/9Convert option below/i);
    expect(msg).not.toMatch(/run.*po-token|po-token server/i);
  });

  it('says so when a configured token did not clear the challenge', () => {
    const msg = playabilityMessage('LOGIN_REQUIRED', "Sign in to confirm you're not a bot", true);
    expect(msg).toMatch(/did not clear it/i);
    expect(msg).toMatch(/9Convert/i);
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
          const vd = 'Cgs3YzRtdWpnTkJCbyjgoba3Bg==';
          const pot =
            tokenCalls === 1
              ? 'Mmjb9zC7RXJtz9vL00XCYxJie5NonEefv5jAsItnbjBeUCwwgD4MpibO3o6lDesALHIKU7WgElG'
              : 'Nnkb0zD8SYKua0wM11YDZyKjf6OpoFfgw6kBtJuockCfVDxxhE5NqjcP4p7mEftBMHJL V8XhFmH'.replace(/ /g, 'V');
          return new Response(JSON.stringify({ visitorData: vd, poToken: pot }), {
            headers: { 'Content-Type': 'application/json' },
          });
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
    // Session + player + gvs up front, then a forced player refresh.
    expect(tokenCalls).toBeGreaterThanOrEqual(2);
    expect(playerBodies.length).toBeGreaterThan(0);
    const pots = playerBodies.map(b => {
      try {
        return JSON.parse(b).serviceIntegrityDimensions?.poToken as string | undefined;
      } catch {
        return undefined;
      }
    });
    expect(pots.some(Boolean)).toBe(true);
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

  beforeEach(() => {
    // Pin these tests to the private-instance path so a directory lookup
    // can't reach the network or perturb the stubbed call list.
    process.env.COBALT_PUBLIC_DISCOVERY = '0';
    resetCobaltDirectoryCache();
  });

  afterEach(() => {
    process.env = { ...SAVED };
    vi.unstubAllGlobals();
    resetCobaltDirectoryCache();
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
    if (isExtractError(result)) {
      // Visitors get a plain sentence with exactly ONE instruction. The raw
      // instance host and cobalt code go to the server log, not the page.
      expect(result.error).toBe(
        'No independent conversion service could fetch this video right now. Try a converter below.',
      );
      expect(result.error).not.toMatch(/error\.api\./);
      expect(result.error).not.toMatch(/cobalt/i);
      expect(result.error.match(/below/gi) ?? []).toHaveLength(1);
    }
  });

  it('is never called when COBALT_API_URL is unset and discovery is off', async () => {
    delete process.env.COBALT_API_URL;
    const calls = stubDeadUpstreams({ status: 'tunnel', url: 'https://cobalt.example.com/x' });

    await extractMedia('youtube', 'https://www.youtube.com/watch?v=Y1Z3Q3O7IRE', 'mp4', 'best');
    expect(calls.some(u => u.startsWith('https://cobalt.example.com'))).toBe(false);
  });
});

describe('withFallbackHint (one actionable instruction, never two)', () => {
  it('does not append a second pointer when the message already has one', () => {
    const bot = playabilityMessage('LOGIN_REQUIRED', "Sign in to confirm you're not a bot");
    const hinted = withFallbackHint(bot);
    expect(hinted).toBe(bot);
    expect(hinted).toMatch(/9Convert option below/);
    // The exact regression: "…Use the 9Convert option below. Try a converter
    // below." Two instructions for one action.
    expect(hinted).not.toMatch(/Try a converter below/);
    expect(hinted.match(/below/gi) ?? []).toHaveLength(1);
  });

  it('appends the pointer when the message has none', () => {
    expect(withFallbackHint('This video is private and cannot be downloaded.')).toBe(
      'This video is private and cannot be downloaded. Try a converter below.',
    );
  });

  it('adds the missing full stop before the pointer', () => {
    expect(withFallbackHint('Something went wrong')).toBe('Something went wrong. Try a converter below.');
    expect(withFallbackHint('Really?')).toBe('Really? Try a converter below.');
  });

  it('degrades to the bare pointer for an empty message', () => {
    expect(withFallbackHint('')).toBe('Try a converter below.');
    expect(withFallbackHint('   ')).toBe('Try a converter below.');
  });

  it('leaves any "converters below" phrasing alone', () => {
    const msg = 'No MP3 source here — use one of the converters below.';
    expect(withFallbackHint(msg)).toBe(msg);
  });
});

describe('bot-check wording end to end', () => {
  it('gives a bot-challenged visitor exactly one instruction', () => {
    for (const configured of [false, true]) {
      const msg = withFallbackHint(
        playabilityMessage('LOGIN_REQUIRED', "Sign in to confirm you're not a bot", configured),
      );
      expect(msg).toMatch(/bot check/i);
      expect(msg.match(/below/gi) ?? []).toHaveLength(1);
      // And it must not be reworded into an age-gate claim.
      expect(msg).not.toMatch(/age.restricted/i);
    }
  });
});
