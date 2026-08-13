import { afterEach, describe, expect, it, vi } from 'vitest';
import { PIPED_INSTANCES, pipedFormats, pipedStreamsUrl } from './piped';
import { pickYouTubeFormat } from './youtube-formats';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const PIPED_PROXY_VIDEO = 'https://pipedproxy-bom.kavin.rocks/videoplayback?mime=video/mp4&id=v';
const PIPED_PROXY_AUDIO = 'https://pipedproxy-bom.kavin.rocks/videoplayback?mime=audio/mp4&id=a';

const okStreams = {
  title: 'Tobu - Hope',
  uploader: 'NoCopyrightSounds',
  audioStreams: [
    {
      bitrate: 128_000,
      codec: 'mp4a.40.2',
      format: 'M4A',
      mimeType: 'audio/mp4',
      quality: '128 kbps',
      url: PIPED_PROXY_AUDIO,
      videoOnly: false,
    },
  ],
  videoStreams: [
    {
      bitrate: 2_500_000,
      codec: 'avc1.64001F',
      format: 'MPEG_4',
      fps: 30,
      height: 720,
      width: 1280,
      mimeType: 'video/mp4',
      quality: '720p',
      url: PIPED_PROXY_VIDEO,
      videoOnly: false,
    },
  ],
};

describe('pipedStreamsUrl', () => {
  it('builds the /streams/:id path and trims trailing slashes', () => {
    expect(pipedStreamsUrl('https://pipedapi.kavin.rocks/', 'abc123')).toBe(
      'https://pipedapi.kavin.rocks/streams/abc123',
    );
    expect(pipedStreamsUrl('https://pipedapi.adminforge.de', 'xyz')).toBe(
      'https://pipedapi.adminforge.de/streams/xyz',
    );
  });

  it('URL-encodes the video id', () => {
    expect(pipedStreamsUrl('https://x', 'a/b?c')).toContain('/streams/a%2Fb%3Fc');
  });
});

describe('pipedFormats', () => {
  it('maps audio and video streams into PlayerFormat shapes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(okStreams)));
    const result = await pipedFormats('Y1Z3Q3O7IRE');
    expect(result.formats).toHaveLength(2);
    const video = result.formats.find(f => /video\//.test(f.mimeType || ''));
    const audio = result.formats.find(f => /audio\//.test(f.mimeType || ''));
    expect(video?.url).toBe(PIPED_PROXY_VIDEO);
    expect(video?.height).toBe(720);
    expect(video?.qualityLabel).toBe('720p');
    // Codec is appended to the mime type so the picker's avc1/m4a detection works.
    expect(video?.mimeType).toMatch(/codecs="avc1/);
    expect(audio?.url).toBe(PIPED_PROXY_AUDIO);
    expect(audio?.audioQuality).toBe('AUDIO_QUALITY_MEDIUM');
    expect(audio?.bitrate).toBe(128_000);
    expect(result.error).toBeUndefined();
  });

  it('picks a progressive video and an audio track through the shared picker', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(okStreams)));
    const { formats } = await pipedFormats('Y1Z3Q3O7IRE');
    // Piped proxies are allowlisted media hosts, so the picker accepts them.
    const video = pickYouTubeFormat(formats, 'video', 'best');
    const audio = pickYouTubeFormat(formats, 'audio', 'best');
    expect(video?.url).toBe(PIPED_PROXY_VIDEO);
    expect(audio?.url).toBe(PIPED_PROXY_AUDIO);
  });

  it('tries the next instance when the first is down', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        if (calls === 1) throw new Error('network down');
        return jsonResponse(okStreams);
      }),
    );
    const result = await pipedFormats('Y1Z3Q3O7IRE');
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(result.formats.length).toBeGreaterThan(0);
  });

  it('tries the next instance on a non-200 response', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        if (calls === 1) return jsonResponse({ error: 'rate limited' }, 429);
        return jsonResponse(okStreams);
      }),
    );
    const result = await pipedFormats('Y1Z3Q3O7IRE');
    expect(result.formats.length).toBeGreaterThan(0);
  });

  it('surfaces the Piped error when no instance returns streams', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'Video unavailable' }, 200)),
    );
    const result = await pipedFormats('Y1Z3Q3O7IRE');
    expect(result.formats).toEqual([]);
    expect(result.error).toMatch(/unavailable/i);
  });

  it('ignores entries without a usable https URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          audioStreams: [{ mimeType: 'audio/mp4', bitrate: 128_000, url: 'http://insecure/x' }],
          videoStreams: [{ mimeType: 'video/mp4', height: 720 /* no url */ }],
        }),
      ),
    );
    const result = await pipedFormats('Y1Z3Q3O7IRE');
    expect(result.formats).toEqual([]);
  });

  it('ships the refreshed public instance list', () => {
    expect(PIPED_INSTANCES).toEqual([
      'https://pipedapi.kavin.rocks',
      'https://api.piped.private.coffee',
      'https://pipedapi.reallyaweso.me',
      'https://pipedapi.nosebs.ru',
      'https://piped-api.privacy.com.de',
      'https://pipedapi.owo.si',
      'https://piped-api.codespace.cz',
      'https://pipedapi.darkness.services',
      'https://pipedapi.orangenet.cc',
    ]);
    for (const base of PIPED_INSTANCES) {
      expect(() => new URL(base)).not.toThrow();
      expect(base.startsWith('https://')).toBe(true);
    }
  });

  it('no longer lists the instances that stopped serving Piped (2026-08-12)', () => {
    const dead = [
      'https://pipedapi.adminforge.de', // subdomain now redirects to a blog
      'https://pipedapi.leptons.xyz', // Cloudflare 502
      'https://pipedapi.drgns.space', // TLS handshake broken
      'https://pipedapi.ducks.party', // TLS certificate invalid
    ];
    for (const base of dead) {
      expect(PIPED_INSTANCES).not.toContain(base);
    }
  });

  it('records every instance outcome, including the one that succeeded', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        if (calls === 1) throw new Error('network down');
        return jsonResponse(okStreams);
      }),
    );
    const result = await pipedFormats('Y1Z3Q3O7IRE');
    expect(result.instances).toHaveLength(PIPED_INSTANCES.length);
    expect(result.instances[0]).toMatchObject({
      base: PIPED_INSTANCES[0],
      ok: false,
      transient: true,
    });
    expect(result.instances[0].httpStatus).toBeUndefined();
    expect(result.instances[0].error).toMatch(/network down/);
    expect(result.instances[1]).toMatchObject({ base: PIPED_INSTANCES[1], ok: true, httpStatus: 200 });
    // Every configured instance is contacted concurrently, rather than making
    // a dead first host consume one full timeout before starting the next.
    expect(result.instances.slice(1).every(instance => instance.ok)).toBe(true);
  });

  it('marks HTTP 5xx from an instance as transient', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'bad gateway' }, 502)),
    );
    const result = await pipedFormats('Y1Z3Q3O7IRE');
    expect(result.formats).toEqual([]);
    expect(result.instances).toHaveLength(PIPED_INSTANCES.length);
    for (const instance of result.instances) {
      expect(instance.httpStatus).toBe(502);
      expect(instance.transient).toBe(true);
      expect(instance.error).toMatch(/502/);
    }
    expect(result.error).toMatch(/502/);
  });

  it('does NOT mark 4xx or video-level errors as transient', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        if (calls === 1) return jsonResponse({ error: 'rate limited' }, 429);
        return jsonResponse({ error: 'Video unavailable' }, 200);
      }),
    );
    const result = await pipedFormats('Y1Z3Q3O7IRE');
    expect(result.formats).toEqual([]);
    expect(result.instances[0]).toMatchObject({ httpStatus: 429, transient: false });
    expect(result.instances[1]).toMatchObject({
      httpStatus: 200,
      ok: false,
      transient: false,
      error: 'Video unavailable',
    });
  });
});
