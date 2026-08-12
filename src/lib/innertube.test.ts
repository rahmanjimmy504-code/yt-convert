import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  INNERTUBE_CLIENTS,
  buildInnertubePlayerRequest,
  collectPlayerFormats,
  hasDirectUrl,
  innertubeFormats,
  playabilityMessage,
} from './extract';
import { pickYouTubeFormat, type PlayerFormat } from './youtube-formats';

const GV_VIDEO = 'https://rr1---sn-test.googlevideo.com/videoplayback?id=v720';
const GV_AUDIO = 'https://rr2---sn-test.googlevideo.com/videoplayback?id=a128';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Innertube client table', () => {
  it('only ships clients known to return direct URLs', () => {
    const names = INNERTUBE_CLIENTS.map(c => c.clientName);
    expect(names).toEqual([
      'ANDROID',
      'IOS',
      'ANDROID_VR',
      'VISIONOS',
      'WEB_EMBEDDED_PLAYER',
      'TVHTML5',
    ]);
  });

  it('tries ANDROID first and pairs each client with a matching id', () => {
    expect(INNERTUBE_CLIENTS[0].clientName).toBe('ANDROID');
    const ids = Object.fromEntries(INNERTUBE_CLIENTS.map(c => [c.clientName, c.clientId]));
    expect(ids).toMatchObject({
      ANDROID: '3',
      IOS: '5',
      ANDROID_VR: '28',
      VISIONOS: '101',
      WEB_EMBEDDED_PLAYER: '56',
      TVHTML5: '7',
    });
  });

  it('does not include the retired ANDROID_TESTSUITE client', () => {
    // YouTube retired ANDROID_TESTSUITE and yt-dlp removed it; sending it
    // would be a guaranteed-dead request on every lookup.
    expect(INNERTUBE_CLIENTS.some(c => c.clientName === 'ANDROID_TESTSUITE')).toBe(false);
  });

  it('does not include the retired TVHTML5_SIMPLY_EMBEDDED_PLAYER client', () => {
    // yt-dlp removed it in 2026-01: YouTube now answers "YouTube is no longer
    // supported in this application or device". It was replaced by the
    // current TVHTML5 client (same role, current version).
    expect(INNERTUBE_CLIENTS.some(c => c.clientName === 'TVHTML5_SIMPLY_EMBEDDED_PLAYER')).toBe(false);
    expect(INNERTUBE_CLIENTS.some(c => c.clientId === '85')).toBe(false);
  });

  it('ships the web embedded client with a public API key and embed context', () => {
    const web = INNERTUBE_CLIENTS.find(c => c.clientName === 'WEB_EMBEDDED_PLAYER');
    expect(web).toBeDefined();
    // The web embed player requires the (non-secret) public Innertube key.
    expect(web?.apiKey).toMatch(/^AIza[0-9A-Za-z_-]+$/);
    expect(web?.embed).toBe(true);
    expect(web?.clientId).toBe('56');
  });

  it('uses current web-embedded and TV client versions from yt-dlp', () => {
    const web = INNERTUBE_CLIENTS.find(c => c.clientName === 'WEB_EMBEDDED_PLAYER')!;
    const tv = INNERTUBE_CLIENTS.find(c => c.clientName === 'TVHTML5')!;
    // The 1.20240726.00.00 web version previously shipped was refused with
    // "This video is unavailable" — the current 2.2026xxxx string is what
    // yt-dlp ships (verified 2026-08-12).
    expect(web.clientVersion).toMatch(/^2\.2026\d{4}\.\d{2}\.\d{2}$/);
    expect(parseInt(web.clientVersion.slice(2, 10), 10)).toBeGreaterThan(20260101);
    // TVHTML5_SIMPLY_EMBEDDED_PLAYER 2.0 was retired; the current TV client
    // is TVHTML5 7.2026xxxx (yt-dlp `tv` entry).
    expect(tv.clientVersion).toMatch(/^7\.2026\d{4}\.\d{2}\.\d{2}$/);
    // The version must appear in the User-Agent too, or YouTube 400s.
    expect(tv.userAgent).toContain('Cobalt/25');
    expect(web.userAgent).toMatch(/Chrome\/1[5-9][0-9]\./);
  });

  it('uses client versions new enough to be accepted', () => {
    const android = INNERTUBE_CLIENTS.find(c => c.clientName === 'ANDROID')!;
    const ios = INNERTUBE_CLIENTS.find(c => c.clientName === 'IOS')!;
    // Guards against silently regressing to the stale 19.x versions that
    // YouTube now rejects.
    expect(parseInt(android.clientVersion, 10)).toBeGreaterThanOrEqual(20);
    expect(parseInt(ios.clientVersion, 10)).toBeGreaterThanOrEqual(20);
    // The version must also appear in the User-Agent, or YouTube 400s.
    expect(android.userAgent).toContain(android.clientVersion);
    expect(ios.userAgent).toContain(ios.clientVersion);
  });
});

describe('buildInnertubePlayerRequest', () => {
  const web = INNERTUBE_CLIENTS.find(c => c.clientName === 'WEB_EMBEDDED_PLAYER')!;
  const tv = INNERTUBE_CLIENTS.find(c => c.clientName === 'TVHTML5')!;

  it('sends a non-YouTube Referer for the web embedded client (yt-dlp#16177)', () => {
    const req = buildInnertubePlayerRequest(web, 'dQw4w9WgXcQ');
    expect(req.headers['Referer']).toBe('https://www.reddit.com/');
    expect(req.headers['User-Agent']).toContain('Chrome/');
    expect(req.headers['X-YouTube-Client-Name']).toBe('56');
    expect(req.headers['X-YouTube-Client-Version']).toBe(web.clientVersion);
    // The context must carry the same non-YouTube embedUrl — youtube.com
    // origins are refused with error 152 since 2026-03.
    const context = req.body.context as Record<string, any>;
    expect(context.thirdParty).toEqual({ embedUrl: 'https://www.reddit.com/' });
    expect(req.endpoint).toMatch(/[?&]key=AIza/);
  });

  it('sends no third-party embed context for the TV client', () => {
    const req = buildInnertubePlayerRequest(tv, 'dQw4w9WgXcQ');
    const context = req.body.context as Record<string, any>;
    expect(context.thirdParty).toBeUndefined();
    expect(req.headers['Referer']).toBeUndefined();
    expect(req.headers['X-YouTube-Client-Name']).toBe('7');
    expect(req.headers['X-YouTube-Client-Version']).toBe(tv.clientVersion);
    // Plain TV client requests carry no API key.
    expect(req.endpoint).not.toContain('key=');
  });

  it('attaches visitorData and poToken (except for skipPoToken clients)', () => {
    const options = { poToken: { visitorData: 'VD', poToken: 'PT' } };
    const webReq = buildInnertubePlayerRequest(web, 'dQw4w9WgXcQ', options);
    const webContext = webReq.body.context as Record<string, any>;
    expect(webContext.client.visitorData).toBe('VD');
    expect((webReq.body.serviceIntegrityDimensions as any).poToken).toBe('PT');

    const tvReq = buildInnertubePlayerRequest(tv, 'dQw4w9WgXcQ', options);
    const tvContext = tvReq.body.context as Record<string, any>;
    expect(tvContext.client.visitorData).toBe('VD');
    expect(tvReq.body.serviceIntegrityDimensions).toBeUndefined();
  });
});

describe('hasDirectUrl / collectPlayerFormats', () => {
  it('requires a real, non-empty string url', () => {
    expect(hasDirectUrl({ url: GV_VIDEO })).toBe(true);
    expect(hasDirectUrl({})).toBe(false);
    expect(hasDirectUrl({ url: '' })).toBe(false);
    expect(hasDirectUrl({ url: '   ' })).toBe(false);
    // A non-string url (malformed upstream payload) must never pass.
    expect(hasDirectUrl({ url: 123 as unknown as string })).toBe(false);
  });

  it('drops signatureCipher-only formats', () => {
    const formats = collectPlayerFormats({
      streamingData: {
        formats: [
          { itag: 18, mimeType: 'video/mp4', signatureCipher: 's=abc&url=https%3A%2F%2Fx.googlevideo.com%2Fv' },
          { itag: 22, mimeType: 'video/mp4', url: GV_VIDEO },
        ],
        adaptiveFormats: [
          { itag: 251, mimeType: 'audio/webm', cipher: 's=def&url=https%3A%2F%2Fy.googlevideo.com%2Fa' },
          { itag: 140, mimeType: 'audio/mp4', url: GV_AUDIO },
        ],
      },
    } as unknown as Record<string, unknown>);

    expect(formats.map(f => f.itag)).toEqual([22, 140]);
    expect(formats.every(hasDirectUrl)).toBe(true);
  });

  it('returns nothing when every format is cipher-only', () => {
    const formats = collectPlayerFormats({
      streamingData: {
        formats: [{ itag: 18, signatureCipher: 's=abc' }],
        adaptiveFormats: [{ itag: 140, signatureCipher: 's=def' }],
      },
    } as unknown as Record<string, unknown>);
    expect(formats).toEqual([]);
  });

  it('tolerates a response without streamingData', () => {
    expect(collectPlayerFormats({})).toEqual([]);
  });
});

describe('direct URL formats win over signatureCipher formats', () => {
  // We do not implement signature/n-parameter deciphering, so a cipher-only
  // entry can never be handed to the proxy: it would be a dead download.
  const mixed: PlayerFormat[] = [
    // Higher quality but cipher-only (no usable url) -> must be ignored.
    {
      mimeType: 'video/mp4; codecs="avc1.640028, mp4a.40.2"',
      qualityLabel: '1080p',
      audioQuality: 'AUDIO_QUALITY_MEDIUM',
      height: 1080,
      bitrate: 4_000_000,
      itag: 137,
    },
    // Lower quality but directly playable -> must win.
    {
      url: GV_VIDEO,
      mimeType: 'video/mp4; codecs="avc1.64001F, mp4a.40.2"',
      qualityLabel: '720p',
      audioQuality: 'AUDIO_QUALITY_MEDIUM',
      height: 720,
      bitrate: 2_500_000,
      itag: 22,
    },
    {
      mimeType: 'audio/mp4; codecs="mp4a.40.2"',
      audioQuality: 'AUDIO_QUALITY_HIGH',
      bitrate: 256_000,
      itag: 141,
    },
    {
      url: GV_AUDIO,
      mimeType: 'audio/mp4; codecs="mp4a.40.2"',
      audioQuality: 'AUDIO_QUALITY_MEDIUM',
      bitrate: 128_000,
      itag: 140,
    },
  ];

  it('picks the direct-URL MP4 over a better cipher-only MP4', () => {
    const picked = pickYouTubeFormat(mixed, 'video', 'best');
    expect(picked?.itag).toBe(22);
    expect(picked?.url).toBe(GV_VIDEO);
  });

  it('picks the direct-URL audio over a better cipher-only audio', () => {
    const picked = pickYouTubeFormat(mixed, 'audio', 'best');
    expect(picked?.itag).toBe(140);
    expect(picked?.url).toBe(GV_AUDIO);
  });

  it('returns null when only cipher-only formats exist (no deciphering)', () => {
    const cipherOnly = mixed.filter(f => !f.url);
    expect(pickYouTubeFormat(cipherOnly, 'video', 'best')).toBeNull();
    expect(pickYouTubeFormat(cipherOnly, 'audio', 'best')).toBeNull();
  });
});

describe('innertubeFormats', () => {
  it('returns the first client that yields direct URLs', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        playabilityStatus: { status: 'OK' },
        streamingData: {
          formats: [{ itag: 22, mimeType: 'video/mp4', url: GV_VIDEO }],
          adaptiveFormats: [{ itag: 140, mimeType: 'audio/mp4', url: GV_AUDIO }],
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await innertubeFormats('dQw4w9WgXcQ');
    expect(result.formats).toHaveLength(2);
    expect(result.status).toBeUndefined();
    // Stops at the first working client instead of hammering all of them.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls through to the next client when the first returns cipher-only formats', async () => {
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        call += 1;
        if (call === 1) {
          return jsonResponse({
            playabilityStatus: { status: 'OK' },
            streamingData: { formats: [{ itag: 18, signatureCipher: 's=abc' }] },
          });
        }
        return jsonResponse({
          playabilityStatus: { status: 'OK' },
          streamingData: { formats: [{ itag: 22, mimeType: 'video/mp4', url: GV_VIDEO }] },
        });
      }),
    );

    const result = await innertubeFormats('dQw4w9WgXcQ');
    // The cipher-only first client contributes nothing, so the second client's
    // direct format is what comes back. (All clients are polled here because
    // none of these stubs offer an audio-only stream.)
    expect(call).toBeGreaterThanOrEqual(2);
    expect(result.formats).toHaveLength(1);
    expect(result.formats[0].url).toBe(GV_VIDEO);
  });

  it('keeps querying when a client returns video but no audio (live-observed)', async () => {
    // Reproduces the real 2026-08-12 response: ANDROID answers OK with a
    // single direct progressive 360p format (itag 18, everything else
    // SABR-only), while ANDROID_VR returns the full adaptive ladder.
    // Stopping at ANDROID capped video at 360p and broke mp3 entirely.
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        const client = body.context.client.clientName;
        calls.push(client);
        if (client === 'ANDROID') {
          return jsonResponse({
            playabilityStatus: { status: 'OK' },
            streamingData: {
              formats: [
                {
                  itag: 18,
                  mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
                  qualityLabel: '360p',
                  height: 360,
                  audioQuality: 'AUDIO_QUALITY_LOW',
                  bitrate: 500_000,
                  url: GV_VIDEO + '360',
                },
              ],
            },
          });
        }
        if (client === 'IOS') {
          // OK but zero direct URLs (all SABR).
          return jsonResponse({ playabilityStatus: { status: 'OK' }, streamingData: {} });
        }
        return jsonResponse({
          playabilityStatus: { status: 'OK' },
          streamingData: {
            formats: [
              {
                itag: 22,
                mimeType: 'video/mp4; codecs="avc1.64001F, mp4a.40.2"',
                qualityLabel: '720p',
                height: 720,
                audioQuality: 'AUDIO_QUALITY_MEDIUM',
                bitrate: 2_500_000,
                url: GV_VIDEO + '720',
              },
            ],
            adaptiveFormats: [
              {
                itag: 140,
                mimeType: 'audio/mp4; codecs="mp4a.40.2"',
                audioQuality: 'AUDIO_QUALITY_MEDIUM',
                bitrate: 128_000,
                url: GV_AUDIO,
              },
            ],
          },
        });
      }),
    );

    const result = await innertubeFormats('dQw4w9WgXcQ');

    // It must not stop at ANDROID's lone progressive format.
    expect(calls).toContain('ANDROID_VR');
    // Audio is now available, so mp3 downloads work.
    const audio = pickYouTubeFormat(result.formats, 'audio', 'best');
    expect(audio?.itag).toBe(140);
    // And video is no longer capped at ANDROID's 360p.
    const video = pickYouTubeFormat(result.formats, 'video', 'best');
    expect(video?.height).toBe(720);
  });

  it('merges formats across clients without duplicating itags', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const client = JSON.parse(String(init.body)).context.client.clientName;
        if (client === 'ANDROID') {
          return jsonResponse({
            playabilityStatus: { status: 'OK' },
            streamingData: {
              formats: [{ itag: 18, mimeType: 'video/mp4', url: GV_VIDEO }],
            },
          });
        }
        return jsonResponse({
          playabilityStatus: { status: 'OK' },
          streamingData: {
            // itag 18 repeats here and must not be duplicated.
            formats: [{ itag: 18, mimeType: 'video/mp4', url: GV_VIDEO }],
            adaptiveFormats: [{ itag: 140, mimeType: 'audio/mp4', url: GV_AUDIO }],
          },
        });
      }),
    );

    const result = await innertubeFormats('dQw4w9WgXcQ');
    const itags = result.formats.map(f => f.itag);
    expect(itags).toEqual([18, 140]);
  });

  it('still returns video-only formats when no client offers audio', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          playabilityStatus: { status: 'OK' },
          streamingData: {
            formats: [
              {
                itag: 18,
                mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
                qualityLabel: '360p',
                height: 360,
                audioQuality: 'AUDIO_QUALITY_LOW',
                url: GV_VIDEO,
              },
            ],
          },
        }),
      ),
    );
    const result = await innertubeFormats('dQw4w9WgXcQ');
    // Degrades gracefully: mp4 still works even though mp3 has no source.
    expect(result.formats.length).toBeGreaterThan(0);
    expect(pickYouTubeFormat(result.formats, 'video', 'best')?.itag).toBe(18);
    expect(pickYouTubeFormat(result.formats, 'audio', 'best')).toBeNull();
  });

  it('falls through to the web embedded client when regular clients return LOGIN_REQUIRED (age-gate bypass)', async () => {
    const calls: Array<{ client: string; hasThirdParty: boolean }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        const client = body.context.client.clientName;
        const hasThirdParty = Boolean(body.context.thirdParty);
        calls.push({ client, hasThirdParty });
        // Non-embedded (phone/VR/visionOS) clients refuse age-gated content.
        if (!hasThirdParty) {
          return jsonResponse({
            playabilityStatus: { status: 'LOGIN_REQUIRED', reason: 'Sign in to confirm your age' },
          });
        }
        // Only WEB_EMBEDDED_PLAYER carries the third-party embed context now
        // (the TV client no longer does — yt-dlp moved the age-gate bypass
        // entirely onto the web embedded player). Its embedUrl must be a
        // NON-YouTube origin, or YouTube answers error 152.
        if (client === 'WEB_EMBEDDED_PLAYER') {
          expect(body.context.thirdParty.embedUrl).toBe('https://www.reddit.com/');
          const headers = Object.fromEntries(new Headers(init.headers as HeadersInit).entries());
          expect(headers['referer']).toBe('https://www.reddit.com/');
          return jsonResponse({
            playabilityStatus: { status: 'OK' },
            streamingData: {
              formats: [
                {
                  itag: 18,
                  mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
                  qualityLabel: '360p',
                  height: 360,
                  audioQuality: 'AUDIO_QUALITY_LOW',
                  bitrate: 500_000,
                  url: GV_VIDEO,
                },
              ],
              adaptiveFormats: [
                {
                  itag: 140,
                  mimeType: 'audio/mp4; codecs="mp4a.40.2"',
                  audioQuality: 'AUDIO_QUALITY_MEDIUM',
                  bitrate: 128_000,
                  url: GV_AUDIO,
                },
              ],
            },
          });
        }
        return jsonResponse({
          playabilityStatus: { status: 'LOGIN_REQUIRED', reason: 'Sign in to confirm your age' },
        });
      }),
    );

    const result = await innertubeFormats('dQw4w9WgXcQ');
    // A regular client and the web embedded client were attempted (the TV
    // client is not reached because web_embedded already returned both audio
    // and video — see the TV fallback test below).
    expect(calls.map(c => c.client)).toContain('ANDROID');
    expect(calls.map(c => c.client)).toContain('WEB_EMBEDDED_PLAYER');
    const web = calls.find(c => c.client === 'WEB_EMBEDDED_PLAYER');
    expect(web?.hasThirdParty).toBe(true);
    // The web embedded client's formats came through — no more LOGIN_REQUIRED.
    expect(result.formats.length).toBeGreaterThan(0);
    expect(result.status).toBeUndefined();
    // Audio is available from the embedded client.
    const audio = pickYouTubeFormat(result.formats, 'audio', 'best');
    expect(audio?.itag).toBe(140);
  });

  it('tries the plain TVHTML5 client last, with no third-party embed context', async () => {
    const calls: Array<{ client: string; hasThirdParty: boolean }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        const client = body.context.client.clientName;
        const hasThirdParty = Boolean(body.context.thirdParty);
        calls.push({ client, hasThirdParty });
        // Everything before the TV client refuses (including web_embedded:
        // this video is not embeddable, e.g. a non-playable-in-embed upload).
        if (client !== 'TVHTML5') {
          return jsonResponse({
            playabilityStatus: { status: 'LOGIN_REQUIRED', reason: 'Sign in to confirm your age' },
          });
        }
        return jsonResponse({
          playabilityStatus: { status: 'OK' },
          streamingData: {
            formats: [{ itag: 22, mimeType: 'video/mp4', url: GV_VIDEO }],
            adaptiveFormats: [{ itag: 140, mimeType: 'audio/mp4', url: GV_AUDIO }],
          },
        });
      }),
    );

    const result = await innertubeFormats('dQw4w9WgXcQ');
    // The TV client is the LAST one tried and receives NO thirdParty context
    // (the current TVHTML5 client is not an embed; only WEB_EMBEDDED_PLAYER
    // carries one).
    const tv = calls.find(c => c.client === 'TVHTML5');
    expect(tv).toBeDefined();
    expect(tv?.hasThirdParty).toBe(false);
    expect(calls[calls.length - 1].client).toBe('TVHTML5');
    expect(result.formats.length).toBeGreaterThan(0);
    expect(result.formats[0].url).toBe(GV_VIDEO);
  });

  it('appends the public API key only for the WEB_EMBEDDED_PLAYER client', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url);
        // Non-embedded clients return no direct streams so the loop falls
        // through to WEB_EMBEDDED_PLAYER (whose URL carries the key) and then
        // to TVHTML5, which finally returns usable streams.
        if (!url.includes('key=')) {
          return jsonResponse({
            playabilityStatus: { status: 'OK' },
            streamingData: { formats: [{ itag: 18, signatureCipher: 's=abc' }] },
          });
        }
        return jsonResponse({
          playabilityStatus: { status: 'OK' },
          streamingData: {
            formats: [{ itag: 22, mimeType: 'video/mp4', url: GV_VIDEO }],
            adaptiveFormats: [{ itag: 140, mimeType: 'audio/mp4', url: GV_AUDIO }],
          },
        });
      }),
    );
    await innertubeFormats('dQw4w9WgXcQ');
    // The first call (ANDROID) has no key.
    expect(urls[0]).not.toContain('key=');
    // Exactly one call carries the key: the WEB_EMBEDDED_PLAYER request.
    const webCalls = urls.filter(u => u.includes('key='));
    expect(webCalls).toHaveLength(1);
    expect(webCalls[0]).toContain('AIza');
    expect(webCalls[0]).toMatch(/[?&]key=AIza/);
  });

  it('attaches an externally-provided PO token to non-TV client requests', async () => {
    const calls: Array<{ client: string; hasPoToken: boolean; hasVisitorData: boolean }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        calls.push({
          client: body.context.client.clientName,
          hasPoToken: Boolean(body.serviceIntegrityDimensions?.poToken),
          hasVisitorData: Boolean(body.context.client.visitorData),
        });
        // Return usable streams only on the last (TV) client so every client
        // in the table is exercised.
        if (body.context.client.clientName === 'TVHTML5') {
          return jsonResponse({
            playabilityStatus: { status: 'OK' },
            streamingData: {
              formats: [{ itag: 22, mimeType: 'video/mp4', url: GV_VIDEO }],
              adaptiveFormats: [{ itag: 140, mimeType: 'audio/mp4', url: GV_AUDIO }],
            },
          });
        }
        return jsonResponse({
          playabilityStatus: { status: 'OK' },
          streamingData: { formats: [{ itag: 18, signatureCipher: 's=abc' }] },
        });
      }),
    );
    await innertubeFormats('dQw4w9WgXcQ', {
      poToken: { visitorData: 'VISITOR_DATA_TOKEN', poToken: 'PO_TOKEN_VALUE' },
    });
    // The first client (ANDROID) receives both visitorData and the poToken.
    expect(calls[0].client).toBe('ANDROID');
    expect(calls[0].hasVisitorData).toBe(true);
    expect(calls[0].hasPoToken).toBe(true);
    // The PO token is NOT attached to the TV client (it ignores it and
    // including it risks a refusal), though visitor data is still set.
    const tv = calls.find(c => c.client === 'TVHTML5');
    expect(tv).toBeDefined();
    expect(tv?.hasPoToken).toBe(false);
    expect(tv?.hasVisitorData).toBe(true);
  });

  it('reports the playability status when every client refuses (including TV embedded)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          playabilityStatus: { status: 'LOGIN_REQUIRED', reason: 'Sign in to confirm your age' },
        }),
      ),
    );

    const result = await innertubeFormats('dQw4w9WgXcQ');
    expect(result.formats).toEqual([]);
    expect(result.status).toBe('LOGIN_REQUIRED');
    expect(result.reason).toBe('Sign in to confirm your age');
    expect(playabilityMessage(result.status, result.reason)).toMatch(/age-restricted or private/i);
  });

  it('survives network errors from every client', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    const result = await innertubeFormats('dQw4w9WgXcQ');
    expect(result.formats).toEqual([]);
  });
});

describe('playabilityMessage', () => {
  it('is empty for OK / unknown status', () => {
    expect(playabilityMessage('OK')).toBe('');
    expect(playabilityMessage(undefined)).toBe('');
  });

  it('explains the common gate states', () => {
    expect(playabilityMessage('LOGIN_REQUIRED')).toMatch(/signed-in account/i);
    expect(playabilityMessage('UNPLAYABLE')).toMatch(/unplayable/i);
    expect(playabilityMessage('LIVE_STREAM_OFFLINE')).toMatch(/live stream is offline/i);
  });

  it('falls back to the upstream reason for unknown statuses', () => {
    expect(playabilityMessage('SOMETHING_NEW', 'Try again later')).toBe(
      'YouTube refused playback: Try again later',
    );
    expect(playabilityMessage('SOMETHING_NEW')).toBe('YouTube refused playback (SOMETHING_NEW).');
  });
});
