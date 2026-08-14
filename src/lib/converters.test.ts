import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ALL_CONVERTERS,
  buildConverterLaunchUrl,
  checkConverterUrl,
  converterGoPath,
  getConverterByName,
  hasAutomaticHandoff,
  isSafeHandoffMediaUrl,
  isSafePostHandoff,
  resolveConverterStatus,
  statusFromHttpStatus,
} from './converters';

function httpResponse(status: number) {
  return { status, body: { cancel: async () => {} } };
}

function timeoutError(): Error {
  return Object.assign(new Error('timed out'), { name: 'TimeoutError' });
}

function networkError(): Error {
  return Object.assign(new Error('fetch failed'), { name: 'TypeError' });
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('catalog', () => {
  it('exports the full converter list with unique names', () => {
    expect(ALL_CONVERTERS.length).toBeGreaterThan(0);
    const names = ALL_CONVERTERS.map(c => c.name);
    expect(new Set(names).size).toBe(names.length);
    for (const converter of ALL_CONVERTERS) {
      expect(converter.url).toMatch(/^https:\/\//);
      expect(converter.platforms.length).toBeGreaterThan(0);
      expect(converter.formats.length).toBeGreaterThan(0);
      expect(['working', 'unavailable']).toContain(converter.status);
    }
  });

  it('looks converters up by name', () => {
    expect(getConverterByName('SaveInsta')?.url).toBe('https://saveinsta.to/en1');
    expect(getConverterByName('FastDL')?.url).toBe('https://fastdl.app/en4');
    expect(getConverterByName('Lucida')).toMatchObject({
      url: 'https://lucida.to/',
      platforms: expect.arrayContaining(['amazonmusic']),
      formats: ['mp3'],
      status: 'working',
    });
    expect(getConverterByName('FBDown')).toMatchObject({
      url: 'https://fdown.net/',
      status: 'working',
    });
    expect(getConverterByName('VDFR')?.status).toBe('unavailable');
    expect(getConverterByName('SpotDown')?.status).toBe('working');
    expect(getConverterByName('Y2Mate')).toBeUndefined();
    expect(getConverterByName('Does Not Exist')).toBeUndefined();
  });
});

describe('handoff', () => {
  const media = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

  it('builds the 9Convert embed deep link from the YouTube id', () => {
    const nine = getConverterByName('9Convert')!;
    expect(buildConverterLaunchUrl(nine, media)).toBe(
      'https://embed.dlsrv.online/v2/full?videoId=dQw4w9WgXcQ',
    );
    expect(hasAutomaticHandoff(nine)).toBe(true);
  });

  it('keeps active YouTube cards on verified handoffs only', () => {
    const youtubeCards = ALL_CONVERTERS.filter(c => c.platforms.includes('youtube'));
    expect(youtubeCards.map(c => c.name)).toEqual(['9Convert', 'AudioConverter', 'Hicoo']);

    const nine = getConverterByName('9Convert')!;
    expect(hasAutomaticHandoff(nine)).toBe(true);
    expect(buildConverterLaunchUrl(nine, media)).toBe(
      'https://embed.dlsrv.online/v2/full?videoId=dQw4w9WgXcQ',
    );

    // Neither site documents a URL/form pre-fill contract. They must remain
    // honest COPY NEEDED cards rather than receiving an invented query key.
    for (const name of ['AudioConverter', 'Hicoo']) {
      const converter = getConverterByName(name)!;
      expect(converter.status).toBe('working');
      expect(hasAutomaticHandoff(converter)).toBe(false);
      expect(buildConverterLaunchUrl(converter, media)).toBe(converter.url);
      expect(converterGoPath(name, media)).toBe(
        `/go?c=${encodeURIComponent(name)}&u=${encodeURIComponent(media)}`,
      );
    }
  });

  it('does not invent query or hash params for clipboard converters', () => {
    const save = getConverterByName('SaveInsta')!;
    const instagram = 'https://www.instagram.com/reel/abc/';
    expect(buildConverterLaunchUrl(save, instagram)).toBe('https://saveinsta.to/en1');
    expect(hasAutomaticHandoff(save)).toBe(false);
  });

  it('uses FastDL address-bar prefix', () => {
    const fast = getConverterByName('FastDL')!;
    expect(buildConverterLaunchUrl(fast, 'https://www.instagram.com/reel/abc/')).toBe(
      'https://f-d.app/https://www.instagram.com/reel/abc/',
    );
    expect(hasAutomaticHandoff(fast)).toBe(true);
  });

  it('builds Twitsave GET /info?url=', () => {
    const twitsave = getConverterByName('Twitsave')!;
    const tweet = 'https://x.com/example/status/123456789?s=20';
    expect(buildConverterLaunchUrl(twitsave, tweet)).toBe(
      `https://twitsave.com/info?url=${encodeURIComponent(tweet)}`,
    );
    expect(hasAutomaticHandoff(twitsave)).toBe(true);
  });

  it('keeps Lucida verified ?url= handoff', () => {
    const lucida = getConverterByName('Lucida')!;
    const deezer = 'https://www.deezer.com/track/3135556';
    expect(buildConverterLaunchUrl(lucida, deezer)).toBe(
      `https://lucida.to/?url=${encodeURIComponent(deezer)}`,
    );
    expect(hasAutomaticHandoff(lucida)).toBe(true);
  });

  it('uses FBDown POST to /download.php with URLz', () => {
    const fb = getConverterByName('FBDown')!;
    expect(fb.handoff).toEqual({
      kind: 'post',
      action: 'https://fdown.net/download.php',
      field: 'URLz',
    });
    expect(buildConverterLaunchUrl(fb, media)).toBe('https://fdown.net/download.php');
    expect(isSafePostHandoff(fb, 'https://fdown.net/download.php')).toBe(true);
    expect(isSafePostHandoff(fb, 'https://evil.example/')).toBe(false);
    expect(hasAutomaticHandoff(fb)).toBe(true);
  });

  it('lists only verified AUTO-SEND converters', () => {
    expect(
      ALL_CONVERTERS.filter(hasAutomaticHandoff)
        .map(c => c.name)
        .sort(),
    ).toEqual(['9Convert', 'FBDown', 'FastDL', 'Lucida', 'Twitsave']);
  });

  it('lists SSSTik as a TikTok clipboard converter', () => {
    const ssstik = getConverterByName('SSSTik')!;
    expect(ssstik.platforms).toEqual(['tiktok']);
    expect(hasAutomaticHandoff(ssstik)).toBe(false);
    expect(buildConverterLaunchUrl(ssstik, 'https://www.tiktok.com/@x/video/1')).toBe(
      'https://ssstik.io/',
    );
  });

  it('builds a same-origin /go path', () => {
    expect(converterGoPath('9Convert', media)).toBe(
      `/go?c=9Convert&u=${encodeURIComponent(media)}`,
    );
  });

  it('rejects unsafe media URLs', () => {
    expect(isSafeHandoffMediaUrl('https://open.spotify.com/track/1')).toBe(true);
    expect(isSafeHandoffMediaUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHandoffMediaUrl('ftp://files.example/a')).toBe(false);
    expect(isSafeHandoffMediaUrl('')).toBe(false);
    expect(isSafeHandoffMediaUrl(`https://example.com/${'a'.repeat(2100)}`)).toBe(false);
  });
});

describe('resolveConverterStatus', () => {
  it('lets a successful live probe win', () => {
    expect(resolveConverterStatus('unavailable', { status: 'working', statusCode: 200 })).toBe('working');
    expect(resolveConverterStatus('working', { status: 'working', statusCode: 301 })).toBe('working');
  });

  it('keeps a curated working badge when the probe is bot-blocked', () => {
    expect(resolveConverterStatus('working', { status: 'unavailable', statusCode: 403 })).toBe('working');
    expect(resolveConverterStatus('working', { status: 'unavailable', statusCode: 401 })).toBe('working');
    expect(resolveConverterStatus('working', { status: 'unavailable', statusCode: 429 })).toBe('working');
  });

  it('follows hard probe failures even if the catalog says working', () => {
    expect(resolveConverterStatus('working', { status: 'unavailable', statusCode: 404 })).toBe('unavailable');
    expect(resolveConverterStatus('working', { status: 'unavailable', statusCode: 503 })).toBe('unavailable');
    expect(resolveConverterStatus('working', { status: 'unavailable' })).toBe('unavailable');
  });

  it('keeps a curated unavailable badge when the probe also fails', () => {
    expect(resolveConverterStatus('unavailable', { status: 'unavailable', statusCode: 503 })).toBe('unavailable');
    expect(resolveConverterStatus('unavailable', { status: 'unavailable' })).toBe('unavailable');
  });
});

describe('statusFromHttpStatus', () => {
  it('treats 2xx and 3xx as working', () => {
    for (const status of [200, 204, 301, 302, 304, 399]) {
      expect(statusFromHttpStatus(status)).toBe('working');
    }
  });

  it('treats 4xx/5xx as unavailable', () => {
    for (const status of [400, 401, 403, 404, 429, 500, 502, 503]) {
      expect(statusFromHttpStatus(status)).toBe('unavailable');
    }
  });
});

describe('checkConverterUrl', () => {
  it('reports working when HEAD succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValue(httpResponse(200));
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkConverterUrl('https://example.com/');
    expect(result.status).toBe('working');
    expect(result.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].method).toBe('HEAD');
  });

  it('falls back to GET when HEAD is rejected', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(httpResponse(405))
      .mockResolvedValueOnce(httpResponse(200));
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkConverterUrl('https://example.com/');
    expect(result.status).toBe('working');
    expect(result.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].method).toBe('GET');
  });

  it('falls back to GET when HEAD throws (connection refused)', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(networkError())
      .mockResolvedValueOnce(httpResponse(200));
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkConverterUrl('https://example.com/');
    expect(result.status).toBe('working');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports unavailable when the site answers 404', async () => {
    const fetchMock = vi.fn().mockResolvedValue(httpResponse(404));
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkConverterUrl('https://example.com/gone');
    expect(result.status).toBe('unavailable');
    expect(result.statusCode).toBe(404);
  });

  it('reports unavailable with a timeout message when both probes time out', async () => {
    const fetchMock = vi.fn().mockRejectedValue(timeoutError());
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkConverterUrl('https://example.com/');
    expect(result.status).toBe('unavailable');
    expect(result.error).toBe('Timed out');
  });

  it('reports unavailable with a connection message on network errors', async () => {
    const fetchMock = vi.fn().mockRejectedValue(networkError());
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkConverterUrl('https://example.com/');
    expect(result.status).toBe('unavailable');
    expect(result.error).toBe('Could not connect');
  });
});
