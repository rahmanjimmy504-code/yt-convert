import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DLSRV_CURRENT_BASE,
  NINECONVERT_BASES,
  isAllowedNineConvertUrl,
  nineConvertFormats,
} from './nineconvert';

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function fakeMp4Response(): Response {
  // Minimal ISO-BMFF ftyp box (32 bytes).
  const bytes = new Uint8Array(32);
  const dv = new DataView(bytes.buffer);
  dv.setUint32(0, 0x20);
  bytes.set(new TextEncoder().encode('ftyp'), 4);
  bytes.set(new TextEncoder().encode('isom'), 8);
  dv.setUint32(12, 0x200);
  bytes.set(new TextEncoder().encode('isomavc1mp41dash'), 16);
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(bytes.length),
    },
  });
}

function fakeMp3Response(): Response {
  const bytes = new Uint8Array(256);
  bytes.set(new TextEncoder().encode('ID3'), 0);
  bytes[3] = 0x03; bytes[4] = 0x00;
  bytes[10] = 0xff; bytes[11] = 0xfb;
  return new Response(bytes, {
    status: 206,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Range': `bytes 0-${bytes.length - 1}/${bytes.length}`,
      'Content-Length': String(bytes.length),
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('nineConvertFormats', () => {
  it('uses the moved embed.dlsrv /api/info + /api/download contract and probes dlink', async () => {
    const calls: Array<{ url: string; body: string; method: string; headers: Headers }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = (init.method || 'GET').toUpperCase();
      calls.push({ url, body: String(init.body || ''), method, headers: new Headers(init.headers) });
      if (url.endsWith('/api/info') && method === 'POST') {
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
      if (url.endsWith('/api/download/mp4') && method === 'POST') {
        return json({ url: 'https://media.embed.dlsrv.online/file.mp4', filename: 'video.mp4' });
      }
      if (url === 'https://media.embed.dlsrv.online/file.mp4' && method === 'GET') {
        return fakeMp4Response();
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
    expect(calls.map(call => call.url)).toEqual(
      expect.arrayContaining([
        `${DLSRV_CURRENT_BASE}/info`,
        `${DLSRV_CURRENT_BASE}/download/mp4`,
        'https://media.embed.dlsrv.online/file.mp4',
      ]),
    );
    const dl = calls.find(c => c.url.endsWith('/download/mp4'))!;
    expect(JSON.parse(dl.body)).toEqual({ videoId: 'dQw4w9WgXcQ', format: 'mp4', quality: '720' });
    expect(dl.headers.get('origin')).toBe('https://embed.dlsrv.online');
    // dlink probe carries same-site Referer.
    const probe = calls.find(c => c.url === 'https://media.embed.dlsrv.online/file.mp4')!;
    expect(probe.headers.get('referer')).toMatch(/embed\.dlsrv\.online\/v2\/full\?videoId=/);
  });

  it('falls back to ajaxSearch then ajaxConvert and keeps k unchanged', async () => {
    const calls: Array<{ url: string; body: string; method: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = (init.method || 'GET').toUpperCase();
      calls.push({ url, body: String(init.body || ''), method });
      if (url === `${DLSRV_CURRENT_BASE}/info` && method === 'POST') return json({}, 404);
      if (url === `${DLSRV_CURRENT_BASE}/download/mp3` && method === 'POST') return json({}, 200);
      if (url === `${NINECONVERT_BASES[0]}/api/ajaxSearch/index` && method === 'POST') {
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
      if (url === `${NINECONVERT_BASES[0]}/api/ajaxConvert/convert` && method === 'POST') {
        return json({ dlink: 'https://files.9convert.org/download/song.mp3' });
      }
      if (url === 'https://files.9convert.org/download/song.mp3' && method === 'GET') {
        return fakeMp3Response();
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

  it('drops an HTML/CAPTCHA dlink and continues to the legacy farm attempt', async () => {
    let dlsrvProbed = false;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = (init.method || 'GET').toUpperCase();
      if (url === `${DLSRV_CURRENT_BASE}/info` && method === 'POST') {
        return json({ status: 'info', info: { formats: [{ type: 'video', format: 'mp4', quality: '720p' }] } });
      }
      if (url === `${DLSRV_CURRENT_BASE}/download/mp4` && method === 'POST') {
        return json({ url: 'https://media.embed.dlsrv.online/captcha' });
      }
      if (url === 'https://media.embed.dlsrv.online/captcha' && method === 'GET') {
        dlsrvProbed = true;
        return new Response('<!doctype html><html><body>CAPTCHA</body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }
      if (url === `${NINECONVERT_BASES[0]}/api/ajaxSearch/index` && method === 'POST') {
        return json({ vid: 'dQw4w9WgXcQ', links: { mp4: { 720: { f: 'mp4', q: '720', k: 'k' } } } });
      }
      if (url === `${NINECONVERT_BASES[0]}/api/ajaxConvert/convert` && method === 'POST') {
        return json({ dlink: 'https://files.9convert.org/file.mp4' });
      }
      if (url === 'https://files.9convert.org/file.mp4' && method === 'GET') {
        return fakeMp4Response();
      }
      return json({}, 404);
    }));
    const formats = await nineConvertFormats('dQw4w9WgXcQ', 'mp4', '720');
    expect(dlsrvProbed).toBe(true);
    expect(formats).toHaveLength(1);
    expect(formats[0].url).toBe('https://files.9convert.org/file.mp4');
  });

  it('rejects a WebM dlink even when the API claims MP4', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = (init.method || 'GET').toUpperCase();
      if (url === `${DLSRV_CURRENT_BASE}/info` && method === 'POST') {
        return json({ status: 'info', info: { formats: [{ type: 'video', format: 'mp4', quality: '720p' }] } });
      }
      if (url === `${DLSRV_CURRENT_BASE}/download/mp4` && method === 'POST') {
        return json({ url: 'https://media.embed.dlsrv.online/wrong.webm' });
      }
      if (url === 'https://media.embed.dlsrv.online/wrong.webm' && method === 'GET') {
        return new Response(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00]), {
          status: 200, headers: { 'Content-Type': 'video/webm' },
        });
      }
      return json({}, 404);
    }));
    await expect(nineConvertFormats('dQw4w9WgXcQ', 'mp4', '720')).resolves.toEqual([]);
  });

  it('waits for a bounded "processing" response before giving up', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = (init.method || 'GET').toUpperCase();
      if (url === `${DLSRV_CURRENT_BASE}/info` && method === 'POST') {
        return json({ status: 'info', info: { formats: [{ type: 'audio', format: 'mp3', quality: '320' }] } });
      }
      if (url === `${DLSRV_CURRENT_BASE}/download/mp3` && method === 'POST') {
        calls += 1;
        if (calls < 3) return json({ status: 'processing', sleep: 0.1 });
        return json({ url: 'https://media.embed.dlsrv.online/song.mp3' });
      }
      if (url === 'https://media.embed.dlsrv.online/song.mp3' && method === 'GET') {
        return fakeMp3Response();
      }
      return json({}, 404);
    }));
    const formats = await nineConvertFormats('dQw4w9WgXcQ', 'mp3', '320');
    expect(formats).toHaveLength(1);
    expect(calls).toBeGreaterThanOrEqual(3);
  });

  it('handles nested format/result shapes and numeric MP3 transcode progress', async () => {
    let downloads = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = (init.method || 'GET').toUpperCase();
      if (url === `${DLSRV_CURRENT_BASE}/info` && method === 'POST') {
        return json({
          data: {
            formats: {
              low: { kind: 'audio', extension: 'mp3', bitrate: '128kbps' },
              high: { mediaType: 'audio', ext: 'mp3', label: '256 kbps' },
            },
          },
        });
      }
      if (url === `${DLSRV_CURRENT_BASE}/download/mp3` && method === 'POST') {
        downloads += 1;
        if (downloads === 1) return json({ data: { progress: 40, retry_after: 0.001 } });
        return json({ response: { output: { download_url: 'https://media.embed.dlsrv.online/transcoded.mp3' } } });
      }
      if (url === 'https://media.embed.dlsrv.online/transcoded.mp3') return fakeMp3Response();
      return json({}, 404);
    }));

    const formats = await nineConvertFormats('dQw4w9WgXcQ', 'mp3', '256');
    expect(downloads).toBe(2);
    expect(formats[0]).toMatchObject({
      url: 'https://media.embed.dlsrv.online/transcoded.mp3',
      bitrate: 256_000,
    });
  });

  it('follows allowlisted CDN redirects with a bounded Range probe and no cookie leak', async () => {
    const calls: Array<{ url: string; headers: Headers }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      calls.push({ url, headers });
      if (url === `${DLSRV_CURRENT_BASE}/info`) {
        return json({ info: { formats: [{ type: 'video', format: 'mp4', quality: '720p' }] } }, 200, {
          'Set-Cookie': 'farm_session=secret; Path=/; Secure',
        });
      }
      if (url === `${DLSRV_CURRENT_BASE}/download/mp4`) {
        return json({ data: { download: { url: 'https://media.embed.dlsrv.online/start' } } });
      }
      if (url === 'https://media.embed.dlsrv.online/start') {
        return new Response(null, { status: 302, headers: { Location: 'https://cdn.dlsrv.online/next' } });
      }
      if (url === 'https://cdn.dlsrv.online/next') {
        return new Response(null, { status: 307, headers: { Location: 'https://rr1---sn-test.googlevideo.com/file' } });
      }
      if (url === 'https://rr1---sn-test.googlevideo.com/file') return fakeMp4Response();
      return json({}, 404);
    }));

    const formats = await nineConvertFormats('dQw4w9WgXcQ', 'mp4', '720');
    expect(formats).toHaveLength(1);
    const probeCalls = calls.filter(call => /\/start$|\/next$|googlevideo\.com\/file$/.test(call.url));
    expect(probeCalls).toHaveLength(3);
    for (const call of probeCalls) expect(call.headers.get('range')).toBe('bytes=0-2047');
    expect(probeCalls[0].headers.get('cookie')).toBeNull();
    expect(probeCalls[1].headers.get('cookie')).toBeNull();
    expect(probeCalls[2].headers.get('cookie')).toBeNull();
  });

  it('rejects a redirect that leaves the strict farm media allowlist', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = (init.method || 'GET').toUpperCase();
      if (url === `${DLSRV_CURRENT_BASE}/download/mp3` && method === 'POST') {
        return json({ url: 'https://media.embed.dlsrv.online/start' });
      }
      if (url === 'https://media.embed.dlsrv.online/start') {
        return new Response(null, { status: 302, headers: { Location: 'https://169.254.169.254/private' } });
      }
      return json({}, 404);
    }));
    await expect(nineConvertFormats('dQw4w9WgXcQ', 'mp3', '128')).resolves.toEqual([]);
  });

  it('restricts farm dlinks to dlsrv, 9Convert, and googlevideo', async () => {
    expect(isAllowedNineConvertUrl('https://media.embed.dlsrv.online/file.mp4')).toBe(true);
    expect(isAllowedNineConvertUrl('https://files.9convert.org/file.mp3')).toBe(true);
    expect(isAllowedNineConvertUrl('https://rr1---sn-test.googlevideo.com/videoplayback')).toBe(true);
    expect(isAllowedNineConvertUrl('https://cf-media.sndcdn.com/file.mp3')).toBe(false);
    expect(isAllowedNineConvertUrl('https://pipedproxy-bom.kavin.rocks/videoplayback')).toBe(false);

    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = (init.method || 'GET').toUpperCase();
      if (url.endsWith('/api/download/mp4') && method === 'POST') return json({ url: 'https://cf-media.sndcdn.com/not-a-farm-file' });
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
