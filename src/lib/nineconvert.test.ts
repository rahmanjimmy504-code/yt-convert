import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DLSRV_CURRENT_BASE,
  NINECONVERT_BASES,
  isAllowedNineConvertUrl,
  nineConvertFormats,
} from './nineconvert';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('nineConvertFormats', () => {
  it('uses the moved embed.dlsrv /api/info + /api/download contract', async () => {
    const calls: Array<{ url: string; body: string; headers: Headers }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body), headers: new Headers(init.headers) });
      if (url.endsWith('/api/info')) {
        return json({
          status: 'info',
          info: {
            formats: [
              { type: 'video', format: 'mp4', quality: '360p' },
              { type: 'video', format: 'mp4', quality: '720p' },
            ],
          },
        });
      }
      if (url.endsWith('/api/download/mp4')) {
        return json({ url: 'https://media.embed.dlsrv.online/file.mp4', filename: 'video.mp4' });
      }
      return json({}, 404);
    }));

    const formats = await nineConvertFormats('dQw4w9WgXcQ', 'mp4', '720');
    expect(formats).toHaveLength(1);
    expect(formats[0]).toMatchObject({
      url: 'https://media.embed.dlsrv.online/file.mp4',
      height: 720,
      audioQuality: 'AUDIO_QUALITY_MEDIUM',
    });
    expect(calls.map(call => call.url)).toEqual([
      `${DLSRV_CURRENT_BASE}/info`,
      `${DLSRV_CURRENT_BASE}/download/mp4`,
    ]);
    expect(JSON.parse(calls[1].body)).toEqual({ videoId: 'dQw4w9WgXcQ', format: 'mp4', quality: '720' });
    expect(calls[1].headers.get('origin')).toBe('https://embed.dlsrv.online');
  });

  it('falls back to ajaxSearch then ajaxConvert and keeps k unchanged', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body) });
      // Current dlsrv endpoints are gone/empty: this must be non-fatal.
      if (url === `${DLSRV_CURRENT_BASE}/info` || url === `${DLSRV_CURRENT_BASE}/download/mp3`) {
        return json({}, url.endsWith('/info') ? 404 : 200);
      }
      if (url === `${NINECONVERT_BASES[0]}/api/ajaxSearch/index`) {
        return json({
          vid: 'dQw4w9WgXcQ',
          links: {
            mp3: {
              128: { f: 'mp3', q: '128', k: 'key+/=kept' },
              320: { f: 'mp3', q: '320', k: 'best-key' },
            },
          },
        });
      }
      if (url === `${NINECONVERT_BASES[0]}/api/ajaxConvert/convert`) {
        return json({ dlink: 'https://files.9convert.org/download/song.mp3' });
      }
      return json({}, 404);
    }));

    const formats = await nineConvertFormats('dQw4w9WgXcQ', 'mp3', '128');
    expect(formats[0]).toMatchObject({
      url: 'https://files.9convert.org/download/song.mp3',
      mimeType: 'audio/mpeg',
      bitrate: 128_000,
    });
    const search = calls.find(call => call.url.endsWith('/api/ajaxSearch/index'))!;
    expect(new URLSearchParams(search.body).get('query')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(new URLSearchParams(search.body).get('vt')).toBe('mp3');
    const convert = calls.find(call => call.url.endsWith('/api/ajaxConvert/convert'))!;
    expect(new URLSearchParams(convert.body).get('vid')).toBe('dQw4w9WgXcQ');
    expect(new URLSearchParams(convert.body).get('k')).toBe('key+/=kept');
  });

  it('restricts farm dlinks to dlsrv, 9Convert, and googlevideo', async () => {
    expect(isAllowedNineConvertUrl('https://media.embed.dlsrv.online/file.mp4')).toBe(true);
    expect(isAllowedNineConvertUrl('https://files.9convert.org/file.mp3')).toBe(true);
    expect(isAllowedNineConvertUrl('https://rr1---sn-test.googlevideo.com/videoplayback')).toBe(true);
    // These hosts are valid for other extractors, but never for a farm dlink.
    expect(isAllowedNineConvertUrl('https://cf-media.sndcdn.com/file.mp3')).toBe(false);
    expect(isAllowedNineConvertUrl('https://pipedproxy-bom.kavin.rocks/videoplayback')).toBe(false);

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/api/download/mp4')) return json({ url: 'https://cf-media.sndcdn.com/not-a-farm-file' });
      return json({}, 404);
    }));
    await expect(nineConvertFormats('dQw4w9WgXcQ', 'mp4', 'best')).resolves.toEqual([]);
  });

  it('treats 404, empty, malformed and network farm hops as non-fatal', async () => {
    let call = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      call += 1;
      if (call % 4 === 1) return new Response('', { status: 404 });
      if (call % 4 === 2) return new Response('', { status: 200 });
      if (call % 4 === 3) return new Response('<html>moved</html>', { status: 200 });
      throw new Error('farm down');
    }));
    await expect(nineConvertFormats('dQw4w9WgXcQ', 'mp4')).resolves.toEqual([]);
  });

  it('rejects invalid video ids without contacting a farm', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(nineConvertFormats('../private', 'mp4')).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
