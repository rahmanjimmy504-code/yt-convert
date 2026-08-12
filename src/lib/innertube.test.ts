import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  INNERTUBE_CLIENTS,
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
    expect(names).toEqual(['ANDROID', 'IOS', 'ANDROID_VR', 'VISIONOS', 'TVHTML5_SIMPLY_EMBEDDED_PLAYER']);
  });

  it('tries ANDROID first and pairs each client with a matching id', () => {
    expect(INNERTUBE_CLIENTS[0].clientName).toBe('ANDROID');
    const ids = Object.fromEntries(INNERTUBE_CLIENTS.map(c => [c.clientName, c.clientId]));
    expect(ids).toMatchObject({ ANDROID: '3', IOS: '5', ANDROID_VR: '28', VISIONOS: '101', TVHTML5_SIMPLY_EMBEDDED_PLAYER: '85' });
  });

  it('does not include the retired ANDROID_TESTSUITE client', () => {
    // YouTube retired ANDROID_TESTSUITE and yt-dlp removed it; sending it
    // would be a guaranteed-dead request on every lookup.
    expect(INNERTUBE_CLIENTS.some(c => c.clientName === 'ANDROID_TESTSUITE')).toBe(false);
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

  it('falls through to TVHTML5 embedded client when regular clients return LOGIN_REQUIRED (age-gate bypass)', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        const client = body.context.client.clientName;
        calls.push(client);
        // Regular clients refuse age-gated content.
        if (client !== 'TVHTML5_SIMPLY_EMBEDDED_PLAYER') {
          return jsonResponse({
            playabilityStatus: { status: 'LOGIN_REQUIRED', reason: 'Sign in to confirm your age' },
          });
        }
        // The TV embedded player bypasses the age gate — it must receive the
        // thirdParty embedUrl in the context.
        expect(body.context.thirdParty).toBeDefined();
        expect(body.context.thirdParty.embedUrl).toContain('dQw4w9WgXcQ');
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
      }),
    );

    const result = await innertubeFormats('dQw4w9WgXcQ');
    // All 4 regular clients + the TV embedded client were tried.
    expect(calls).toContain('ANDROID');
    expect(calls).toContain('TVHTML5_SIMPLY_EMBEDDED_PLAYER');
    // The embedded client's formats came through — no more LOGIN_REQUIRED.
    expect(result.formats.length).toBeGreaterThan(0);
    expect(result.status).toBeUndefined();
    // Audio is available from the embedded client.
    const audio = pickYouTubeFormat(result.formats, 'audio', 'best');
    expect(audio?.itag).toBe(140);
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
