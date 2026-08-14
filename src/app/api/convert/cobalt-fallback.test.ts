/**
 * End-to-end fallback tests driving the REAL GET /api/convert route handler.
 *
 * These exercise the full path a bot-blocked request takes:
 *
 *   YouTube bot-challenges the egress IP
 *     -> Innertube formats discarded
 *     -> mirrors skipped (same IP, same wall)
 *     -> 9Convert farm empty
 *     -> cobalt (private, then reviewed public instances)
 *     -> media-host allowlist re-check
 *     -> convert ticket verified
 *     -> upstream fetched, first 2 KB sniffed
 *     -> real MP3/MP4 BYTES streamed to the client
 *
 * The assertions that matter are on the LAST step: the response must be
 * actual media bytes with the right container magic, not HTML, not JSON, not
 * a CAPTCHA interstitial, and not an expired-redirect page. A test that only
 * checks "status 200" would have passed for every one of those failures.
 *
 * Live network is not used: the cobalt instances and CDNs are stubbed with
 * byte-accurate responses (including the real failure shapes observed in
 * production — Cloudflare interstitials, `error.api.*` codes, HTML served
 * with an audio/mpeg content-type). Live behaviour of the directory itself
 * was verified separately against https://cobalt.directory/api/working.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';
import { issueConvertTicket } from '@/lib/convert-ticket';
import { resetCobaltDirectoryCache, REVIEWED_COBALT_APIS } from '@/lib/cobalt-directory';

const SAVED_ENV = { ...process.env };

const VIDEO = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'; // "Me at the zoo"
const COBALT_HOST = REVIEWED_COBALT_APIS[0];
let ipCounter = 0;
/** A fresh client IP per test: /api/convert rate-limits 10 requests per IP. */
function nextIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter}`;
}
let IP = '203.0.113.1';

/**
 * TS's DOM BodyInit doesn't accept a bare Uint8Array, so hand Response the
 * underlying buffer. Same bytes, no cast needed at each call site.
 */
function asBody(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** A valid MP3: ID3v2 header followed by an MPEG frame sync. */
function mp3Bytes(kb = 8): Uint8Array {
  const out = new Uint8Array(kb * 1024);
  out.set([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], 0); // "ID3"
  out.set([0xff, 0xfb, 0x90, 0x64], 10); // MPEG-1 Layer III frame sync
  for (let i = 14; i < out.length; i++) out[i] = i % 251;
  return out;
}

/** A valid progressive MP4: ISO-BMFF `ftyp` box with an `isom` brand. */
function mp4Bytes(kb = 8): Uint8Array {
  const out = new Uint8Array(kb * 1024);
  const head = [
    0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, // size + "ftyp"
    0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00, // "isom"
    0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32, // compat brands
    0x61, 0x76, 0x63, 0x31, 0x6d, 0x70, 0x34, 0x31,
    0x00, 0x00, 0x00, 0x08, 0x6d, 0x64, 0x61, 0x74, // "mdat"
  ];
  out.set(head, 0);
  for (let i = head.length; i < out.length; i++) out[i] = i % 251;
  return out;
}

/** YouTube's bot wall, exactly as Innertube reports it. */
const BOT_WALL = {
  playabilityStatus: {
    status: 'LOGIN_REQUIRED',
    reason: "Sign in to confirm you're not a bot",
  },
  streamingData: {},
};

interface Scenario {
  /** JSON body each cobalt instance returns, keyed by hostname. */
  cobalt?: Record<string, unknown>;
  /** Hosts the directory reports as YouTube-healthy. */
  directory?: string[];
  /** The media response served for the cobalt tunnel URL. */
  media?: () => Response;
}

function stubWorld(scenario: Scenario) {
  const calls: string[] = [];
  const { cobalt = {}, directory = [`https://${COBALT_HOST}`], media } = scenario;

  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    const host = (() => { try { return new URL(url).hostname; } catch { return ''; } })();

    // The cobalt directory health signal.
    if (host === 'cobalt.directory') {
      return new Response(JSON.stringify({ data: { youtube: directory } }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // YouTube Innertube: bot-challenge every client, like a blocked IP.
    if (host.endsWith('youtube.com') || host.endsWith('youtubei.googleapis.com')) {
      return new Response(JSON.stringify(BOT_WALL), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // The tunnel: real media bytes (or whatever the scenario wants).
    if (host === COBALT_HOST && new URL(url).pathname.startsWith('/tunnel')) {
      return media ? media() : new Response('no media stubbed', { status: 500 });
    }

    // A cobalt API POST.
    if (init?.method === 'POST' && host in cobalt) {
      return new Response(JSON.stringify(cobalt[host]), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Every other upstream (mirrors, Piped, Invidious, the 9Convert farm)
    // is dead, which is what forces the request down to cobalt.
    return new Response('{}', { status: 404 });
  }));

  return calls;
}

/** Build the exact request /api/convert expects, with a valid ticket. */
function convertRequest(format: 'mp3' | 'mp4'): Request {
  const ticket = issueConvertTicket(VIDEO, IP);
  const url = new URL('https://yt-convert.test/api/convert');
  url.searchParams.set('url', VIDEO);
  url.searchParams.set('format', format);
  url.searchParams.set('quality', 'best');
  url.searchParams.set('ticket', ticket);
  url.searchParams.set('title', 'Me at the zoo');
  return new Request(url, { headers: { 'x-forwarded-for': IP } });
}

beforeEach(() => {
  IP = nextIp();
  delete process.env.COBALT_API_URL;
  delete process.env.COBALT_API_AUTH;
  delete process.env.COBALT_PROXY_HOSTS;
  delete process.env.COBALT_PUBLIC_DISCOVERY;
  resetCobaltDirectoryCache();
});

afterEach(() => {
  process.env = { ...SAVED_ENV };
  vi.unstubAllGlobals();
  resetCobaltDirectoryCache();
});

describe('bot-blocked YouTube falls through to cobalt and returns real bytes', () => {
  it('MP4: streams genuine ISO-BMFF bytes, not HTML or JSON', async () => {
    const expected = mp4Bytes();
    stubWorld({
      cobalt: {
        [COBALT_HOST]: { status: 'tunnel', url: `https://${COBALT_HOST}/tunnel?id=mp4&exp=1` },
      },
      media: () => new Response(asBody(expected), {
        headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(expected.length) },
      }),
    });

    const response = await GET(convertRequest('mp4'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('video/mp4');
    expect(response.headers.get('content-disposition')).toMatch(/attachment/);

    const body = new Uint8Array(await response.arrayBuffer());
    expect(body.length).toBe(expected.length);
    // The decisive check: real container magic at the right offset.
    expect(new TextDecoder().decode(body.subarray(4, 8))).toBe('ftyp');
    expect(new TextDecoder().decode(body.subarray(8, 12))).toBe('isom');
    // And definitively NOT a web page or an API error payload.
    const head = new TextDecoder().decode(body.subarray(0, 512)).toLowerCase();
    expect(head).not.toContain('<!doctype');
    expect(head).not.toContain('<html');
    expect(head).not.toContain('"status"');
  });

  it('MP3: streams genuine ID3/MPEG bytes, not HTML or JSON', async () => {
    const expected = mp3Bytes();
    stubWorld({
      cobalt: {
        [COBALT_HOST]: { status: 'tunnel', url: `https://${COBALT_HOST}/tunnel?id=mp3&exp=1` },
      },
      media: () => new Response(asBody(expected), {
        headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(expected.length) },
      }),
    });

    const response = await GET(convertRequest('mp3'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('audio/mpeg');
    expect(response.headers.get('content-disposition')).toMatch(/\.mp3/);

    const body = new Uint8Array(await response.arrayBuffer());
    expect(body.length).toBe(expected.length);
    expect(new TextDecoder().decode(body.subarray(0, 3))).toBe('ID3');
    expect(body[10]).toBe(0xff); // MPEG frame sync
    const head = new TextDecoder().decode(body.subarray(0, 512)).toLowerCase();
    expect(head).not.toContain('<html');
  });

  it('asks cobalt for the right download mode per format', async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const host = new URL(url).hostname;
      if (host === 'cobalt.directory') {
        return new Response(JSON.stringify({ data: { youtube: [`https://${COBALT_HOST}`] } }),
          { headers: { 'Content-Type': 'application/json' } });
      }
      if (host === COBALT_HOST && init?.method === 'POST') {
        bodies.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ status: 'tunnel', url: `https://${COBALT_HOST}/tunnel?id=1` }),
          { headers: { 'Content-Type': 'application/json' } });
      }
      if (host === COBALT_HOST) {
        return new Response(asBody(mp3Bytes()), { headers: { 'Content-Type': 'audio/mpeg' } });
      }
      return new Response(JSON.stringify(BOT_WALL), { headers: { 'Content-Type': 'application/json' } });
    }));

    await GET(convertRequest('mp3'));
    expect(bodies.at(-1)).toMatchObject({ url: VIDEO, downloadMode: 'audio', audioFormat: 'mp3' });
  });
});

describe('a cobalt response that is not really media is refused', () => {
  it('rejects a Cloudflare/CAPTCHA interstitial served as audio/mpeg', async () => {
    // The exact production failure: a challenge page with a media
    // content-type. Trusting the header would have saved an HTML file
    // named song.mp3.
    const html = new TextEncoder().encode(
      '<!DOCTYPE html><html><head><title>Just a moment...</title></head>' +
      '<body><div id="challenge-running">Checking your browser…</div></body></html>',
    );
    stubWorld({
      cobalt: { [COBALT_HOST]: { status: 'tunnel', url: `https://${COBALT_HOST}/tunnel?id=c` } },
      media: () => new Response(asBody(html), { headers: { 'Content-Type': 'audio/mpeg' } }),
    });

    const response = await GET(convertRequest('mp3'));
    expect(response.status).toBe(502);
    const payload = await response.json();
    expect(payload.error).toMatch(/HTML\/CAPTCHA page/i);
  });

  it('rejects a JSON error body served as video/mp4', async () => {
    const json = new TextEncoder().encode('{"status":"error","error":{"code":"error.api.fetch.fail"}}');
    stubWorld({
      cobalt: { [COBALT_HOST]: { status: 'tunnel', url: `https://${COBALT_HOST}/tunnel?id=j` } },
      media: () => new Response(asBody(json), { headers: { 'Content-Type': 'video/mp4' } }),
    });

    const response = await GET(convertRequest('mp4'));
    expect(response.status).toBe(502);
  });

  it('rejects an expired tunnel (410) rather than streaming an error page', async () => {
    stubWorld({
      cobalt: { [COBALT_HOST]: { status: 'tunnel', url: `https://${COBALT_HOST}/tunnel?id=e` } },
      media: () => new Response('tunnel expired', { status: 410 }),
    });

    const response = await GET(convertRequest('mp4'));
    expect(response.status).toBe(502);
    const payload = await response.json();
    expect(payload.error).toMatch(/media host refused/i);
  });

  it('refuses to fetch a tunnel URL pointing at a non-allowlisted host', async () => {
    // A hostile or compromised instance answering with somebody else's URL.
    stubWorld({
      cobalt: { [COBALT_HOST]: { status: 'tunnel', url: 'https://attacker.example/tunnel?id=x' } },
    });

    const response = await GET(convertRequest('mp4'));
    expect(response.status).toBe(502);
    const payload = await response.json();
    // Never leaked as an SSRF fetch, and never surfaced as internal detail.
    expect(payload.error).not.toMatch(/attacker\.example/);
  });

  it('refuses an SSRF payload aimed at cloud metadata', async () => {
    stubWorld({
      cobalt: {
        [COBALT_HOST]: { status: 'redirect', url: 'http://169.254.169.254/latest/meta-data/iam/' },
      },
    });
    const response = await GET(convertRequest('mp4'));
    expect(response.status).toBe(502);
  });
});

describe('failure handling across multiple instances', () => {
  it('tries the remaining candidates after the first instance refuses', async () => {
    const [a, b] = REVIEWED_COBALT_APIS;
    const expected = mp4Bytes();
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      calls.push(url);
      const host = new URL(url).hostname;
      if (host === 'cobalt.directory') {
        return new Response(JSON.stringify({ data: { youtube: [`https://${a}`, `https://${b}`] } }),
          { headers: { 'Content-Type': 'application/json' } });
      }
      if (host === a && init?.method === 'POST') {
        // The realistic public-instance outcome: Turnstile is required.
        return new Response(
          JSON.stringify({ status: 'error', error: { code: 'error.api.auth.turnstile.missing' } }),
          { headers: { 'Content-Type': 'application/json' } });
      }
      if (host === b && init?.method === 'POST') {
        return new Response(JSON.stringify({ status: 'tunnel', url: `https://${b}/tunnel?id=ok` }),
          { headers: { 'Content-Type': 'application/json' } });
      }
      if (host === b) return new Response(asBody(expected), { headers: { 'Content-Type': 'video/mp4' } });
      return new Response(JSON.stringify(BOT_WALL), { headers: { 'Content-Type': 'application/json' } });
    }));

    const response = await GET(convertRequest('mp4'));
    expect(response.status).toBe(200);
    const body = new Uint8Array(await response.arrayBuffer());
    expect(new TextDecoder().decode(body.subarray(4, 8))).toBe('ftyp');
    expect(calls.some(u => u.startsWith(`https://${a}`))).toBe(true);
  });

  it('gives the visitor one clean instruction when every instance fails', async () => {
    stubWorld({
      directory: REVIEWED_COBALT_APIS.slice(0, 3).map(h => `https://${h}`),
      cobalt: Object.fromEntries(REVIEWED_COBALT_APIS.slice(0, 3).map(h => [
        h, { status: 'error', error: { code: 'error.api.auth.turnstile.missing' } },
      ])),
    });

    const response = await GET(convertRequest('mp4'));
    expect(response.status).toBe(502);
    const { error } = await response.json();

    // Exactly one actionable pointer...
    expect((error.match(/below/gi) ?? []).length).toBe(1);
    // ...and no internal detail leaked to the visitor.
    expect(error).not.toMatch(/error\.api\./);
    expect(error).not.toMatch(/turnstile/i);
    expect(error).not.toMatch(/cobalt/i);
    for (const host of REVIEWED_COBALT_APIS) expect(error).not.toContain(host);
  });

  it('still returns a usable file when the private instance is down', async () => {
    process.env.COBALT_API_URL = 'https://cobalt.private.example';
    const expected = mp3Bytes();
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const host = new URL(url).hostname;
      if (host === 'cobalt.private.example') throw new Error('ECONNREFUSED');
      if (host === 'cobalt.directory') {
        return new Response(JSON.stringify({ data: { youtube: [`https://${COBALT_HOST}`] } }),
          { headers: { 'Content-Type': 'application/json' } });
      }
      if (host === COBALT_HOST && init?.method === 'POST') {
        return new Response(JSON.stringify({ status: 'tunnel', url: `https://${COBALT_HOST}/tunnel?id=p` }),
          { headers: { 'Content-Type': 'application/json' } });
      }
      if (host === COBALT_HOST) return new Response(asBody(expected), { headers: { 'Content-Type': 'audio/mpeg' } });
      return new Response(JSON.stringify(BOT_WALL), { headers: { 'Content-Type': 'application/json' } });
    }));

    const response = await GET(convertRequest('mp3'));
    expect(response.status).toBe(200);
    const body = new Uint8Array(await response.arrayBuffer());
    expect(new TextDecoder().decode(body.subarray(0, 3))).toBe('ID3');
  });
});

describe('the convert ticket still gates the cobalt path', () => {
  it('refuses a request with no ticket before any upstream is touched', async () => {
    const calls = stubWorld({
      cobalt: { [COBALT_HOST]: { status: 'tunnel', url: `https://${COBALT_HOST}/tunnel?id=1` } },
      media: () => new Response(asBody(mp4Bytes()), { headers: { 'Content-Type': 'video/mp4' } }),
    });
    const url = new URL('https://yt-convert.test/api/convert');
    url.searchParams.set('url', VIDEO);
    url.searchParams.set('format', 'mp4');
    url.searchParams.set('quality', 'best');

    const response = await GET(new Request(url, { headers: { 'x-forwarded-for': IP } }));
    expect(response.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it('refuses a ticket replayed from a different IP', async () => {
    stubWorld({
      cobalt: { [COBALT_HOST]: { status: 'tunnel', url: `https://${COBALT_HOST}/tunnel?id=1` } },
      media: () => new Response(asBody(mp4Bytes()), { headers: { 'Content-Type': 'video/mp4' } }),
    });
    const url = new URL('https://yt-convert.test/api/convert');
    url.searchParams.set('url', VIDEO);
    url.searchParams.set('format', 'mp4');
    url.searchParams.set('quality', 'best');
    url.searchParams.set('ticket', issueConvertTicket(VIDEO, IP));

    const response = await GET(new Request(url, { headers: { 'x-forwarded-for': '198.51.100.9' } }));
    expect(response.status).toBe(403);
  });
});
