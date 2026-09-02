import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Lightweight tests for the convert route's HTML-rejection and container-
 * honesty behaviour. These tests stub NextResponse / the upstream extractor
 * and drive the GET handler directly.
 */

function buildMp4Bytes(): Uint8Array {
  const bytes = new Uint8Array(32);
  new DataView(bytes.buffer).setUint32(0, 0x20);
  bytes.set(new TextEncoder().encode('ftyp'), 4);
  bytes.set(new TextEncoder().encode('isom'), 8);
  bytes.set(new TextEncoder().encode('isomavc1mp41dash'), 16);
  return bytes;
}
function buildMp3Bytes(): Uint8Array {
  const bytes = new Uint8Array(128);
  bytes.set(new TextEncoder().encode('ID3'), 0);
  bytes[3] = 0x03; bytes[4] = 0x00;
  return bytes;
}

// Helper to make a ReadableStream from a Uint8Array that yields in two chunks.
function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= chunks.length) { controller.close(); return; }
      controller.enqueue(chunks[i++]);
    },
  });
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    parts.push(next.value);
    total += next.value.length;
  }
  const joined = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { joined.set(p, off); off += p.length; }
  return joined;
}

// Mocks built inside each test.
let handler: typeof import('./route')['GET'];
let mockExtract: ReturnType<typeof vi.fn>;
let mockFetchAllowed: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.resetModules();
  mockExtract = vi.fn();
  mockFetchAllowed = vi.fn();
  vi.doMock('@/lib/extract', () => ({
    extractMedia: mockExtract,
    isExtractError: (r: unknown) => typeof r === 'object' && r !== null && 'error' in r,
    sanitizeYouTubeCookies: () => null,
  }));
  vi.doMock('@/lib/media-fetch', () => ({
    fetchAllowedMedia: mockFetchAllowed,
    MediaHostError: class MediaHostError extends Error {},
  }));
  vi.doMock('@/lib/convert-ticket', () => ({
    verifyConvertTicket: () => ({ ok: true }),
  }));
  vi.doMock('@/lib/rate-limit', () => ({
    clientIp: () => '127.0.0.1',
    rateLimit: async () => 0,
  }));
  vi.doMock('@/lib/platforms', () => ({
    canConvertPlatform: () => true,
    convertUnavailableReason: () => '',
    detectPlatform: () => 'youtube',
    extractYouTubeId: () => 'dQw4w9WgXcQ',
  }));
  vi.doMock('@/lib/youtube-formats', () => ({
    isValidQuality: () => true,
    sanitizeDownloadFilename: (t: string, e: string) => `${t}.${e}`,
  }));
  vi.doMock('@/lib/stats', () => ({ recordEvent: vi.fn() }));
  vi.doMock('next/server', () => {
    const { NextResponse } = require('next/server');
    return { NextResponse };
  });
  const mod = await import('./route');
  handler = mod.GET;
});

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

function makeReq(url: string, init: RequestInit = {}): Request {
  return new Request(url, init);
}

describe('/api/convert HTML rejection', () => {
  it('returns a JSON 502 when the upstream answers with text/html instead of media', async () => {
    mockExtract.mockResolvedValue({
      url: 'https://media.embed.dlsrv.online/file.mp3',
      mimeType: 'audio/mpeg',
      extension: 'mp3',
    });
    const htmlBody = streamOf([new TextEncoder().encode('<!doctype html><html><body>CAPTCHA</body></html>')]);
    mockFetchAllowed.mockResolvedValue(new Response(htmlBody, {
      status: 200, headers: { 'Content-Type': 'text/html' },
    }));
    const res = await handler(makeReq('http://x/api/convert?url=https://www.youtube.com/watch?v=v&format=mp3&quality=best&ticket=t&title=song'));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toMatch(/HTML/i);
  });

  it('rejects HTML disguised as application/octet-stream via byte sniffing', async () => {
    mockExtract.mockResolvedValue({
      url: 'https://media.embed.dlsrv.online/file.mp4',
      mimeType: 'application/octet-stream',
      extension: 'mp4',
    });
    const body = streamOf([new TextEncoder().encode('<HTML><HEAD><script>alert(1)</script>')]);
    mockFetchAllowed.mockResolvedValue(new Response(body, {
      status: 200, headers: { 'Content-Type': 'application/octet-stream' },
    }));
    const res = await handler(makeReq('http://x/api/convert?url=https://www.youtube.com/watch?v=v&format=mp4&quality=best&ticket=t&title=v'));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/HTML/i);
  });

  it('words a wrong-container sniff failure honestly (not as a CAPTCHA page)', async () => {
    // The AllDL CDN has been observed serving its MP3 rendition on the video
    // link (2026-09-01); the visitor must hear "wrong file type, retry", not
    // "HTML/CAPTCHA page".
    mockExtract.mockResolvedValue({
      url: 'https://c.ymcdn.org/api/v2/download/x/dQw4w9WgXcQ?_=mac',
      mimeType: 'video/mp4',
      extension: 'mp4',
    });
    mockFetchAllowed.mockResolvedValue(new Response(streamOf([buildMp3Bytes()]), {
      status: 200, headers: { 'Content-Type': 'audio/mpeg' },
    }));
    const res = await handler(makeReq('http://x/api/convert?url=https://www.youtube.com/watch?v=v&format=mp4&quality=best&ticket=t&title=v'));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toMatch(/wrong file type/i);
    expect(json.error).toMatch(/upstream returned mp3, not MP4 video/);
    expect(json.error).not.toMatch(/HTML\/CAPTCHA/i);
  });

  it('exposes the extraction provenance as X-Conversion-Note and sanitizes it', async () => {
    mockExtract.mockResolvedValue({
      url: 'https://c.ymcdn.org/api/v2/download/x/dQw4w9WgXcQ?_=mac',
      mimeType: 'video/mp4',
      extension: 'mp4',
      note: 'AllDL fallback download',
    });
    const mp4 = buildMp4Bytes();
    mockFetchAllowed.mockResolvedValue(new Response(streamOf([mp4]), {
      status: 200, headers: { 'Content-Type': 'video/mp4' },
    }));
    const res = await handler(makeReq('http://x/api/convert?url=https://www.youtube.com/watch?v=v&format=mp4&quality=best&ticket=t&title=v'));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-conversion-note')).toBe('AllDL fallback download');
    await res.body?.cancel().catch(() => undefined);

    // A note carrying non-ASCII/control characters is stripped to safe ASCII.
    mockExtract.mockResolvedValue({
      url: 'https://c.ymcdn.org/api/v2/download/x/dQw4w9WgXcQ?_=mac',
      mimeType: 'video/mp4',
      extension: 'mp4',
      note: ' caf\u00e9 \u0007 note ',
    });
    mockFetchAllowed.mockResolvedValue(new Response(streamOf([mp4]), {
      status: 200, headers: { 'Content-Type': 'video/mp4' },
    }));
    const res2 = await handler(makeReq('http://x/api/convert?url=https://www.youtube.com/watch?v=v&format=mp4&quality=best&ticket=t&title=v'));
    expect(res2.headers.get('x-conversion-note')).toBe('caf  note');
    await res2.body?.cancel().catch(() => undefined);

    // No note at all: the header is simply absent.
    mockExtract.mockResolvedValue({
      url: 'https://c.ymcdn.org/api/v2/download/x/dQw4w9WgXcQ?_=mac',
      mimeType: 'video/mp4',
      extension: 'mp4',
    });
    mockFetchAllowed.mockResolvedValue(new Response(streamOf([mp4]), {
      status: 200, headers: { 'Content-Type': 'video/mp4' },
    }));
    const res3 = await handler(makeReq('http://x/api/convert?url=https://www.youtube.com/watch?v=v&format=mp4&quality=best&ticket=t&title=v'));
    expect(res3.headers.get('x-conversion-note')).toBeNull();
    await res3.body?.cancel().catch(() => undefined);
  });

  it('streams a real MP4 byte-for-byte after tee inspection', async () => {
    mockExtract.mockResolvedValue({
      url: 'https://rr1---sn.example.googlevideo.com/videoplayback',
      mimeType: 'video/mp4',
      extension: 'mp4',
    });
    const mp4 = buildMp4Bytes();
    const tail = new Uint8Array(1024);
    for (let i = 0; i < tail.length; i += 1) tail[i] = i & 0xff;
    const full = new Uint8Array(mp4.length + tail.length);
    full.set(mp4, 0); full.set(tail, mp4.length);
    const body = streamOf([mp4, tail]);
    mockFetchAllowed.mockResolvedValue(new Response(body, {
      status: 200, headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(full.length) },
    }));
    const res = await handler(makeReq('http://x/api/convert?url=https://www.youtube.com/watch?v=v&format=mp4&quality=best&ticket=t&title=v'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('video/mp4');
    // Allow the streaming path a tick to tee.
    const out = await readAll(res.body!);
    expect(out.length).toBe(full.length);
    for (let i = 0; i < out.length; i += 1) {
      if (out[i] !== full[i]) {
        expect.fail(`byte mismatch at ${i}`);
      }
    }
  });

  it('streams a real MP3 byte-for-byte after tee inspection', async () => {
    mockExtract.mockResolvedValue({
      url: 'https://files.9convert.org/song.mp3',
      mimeType: 'audio/mpeg',
      extension: 'mp3',
    });
    const mp3 = buildMp3Bytes();
    const tail = new Uint8Array(2048);
    for (let i = 0; i < tail.length; i += 1) tail[i] = (i * 7) & 0xff;
    const full = new Uint8Array(mp3.length + tail.length);
    full.set(mp3, 0); full.set(tail, mp3.length);
    const body = streamOf([mp3, tail]);
    mockFetchAllowed.mockResolvedValue(new Response(body, {
      status: 200, headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(full.length) },
    }));
    const res = await handler(makeReq('http://x/api/convert?url=https://www.youtube.com/watch?v=v&format=mp3&quality=best&ticket=t&title=song'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
    const out = await readAll(res.body!);
    expect(out.length).toBe(full.length);
    for (let i = 0; i < out.length; i += 1) {
      if (out[i] !== full[i]) expect.fail(`byte mismatch at ${i}`);
    }
  });

  it('returns a 502 when extractor hands back m4a for an mp3 request (no rename)', async () => {
    mockExtract.mockResolvedValue({
      url: 'https://rr1---sn.example.googlevideo.com/audio',
      mimeType: 'audio/mp4',
      extension: 'm4a',
    });
    const res = await handler(makeReq('http://x/api/convert?url=https://www.youtube.com/watch?v=v&format=mp3&quality=best&ticket=t&title=song'));
    expect(res.status).toBe(502);
  });
});
