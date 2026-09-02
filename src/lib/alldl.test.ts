import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ALLDL_API_BASE,
  ALLDL_MEDIA_HOSTS,
  alldlFormats,
  isAllowedAlldlUrl,
  parseAlldlPayload,
  resetAlldlNegativeCache,
  sniffAlldlContainer,
} from './alldl';

/** The envelope shape served live by ahm7xmakki.com (captured 2026-09-01). */
function liveEnvelope(overrides: Record<string, unknown> = {}): unknown {
  return {
    success: true,
    links: ['https://tinyurl.com/5euz3dnn', 'https://tinyurl.com/4cbz7smj'],
    note: '🚀 Want more free APIs? Follow these channels.',
    mediaInfo: {
      title: 'Tobu - Hope (Original Mix)',
      author: 'Tobu',
      thumbnail: 'https://i.ytimg.com/vi/Y1Z3Q3O7IRE/hqdefault.jpg',
      duration: null,
      videoUrl:
        'https://c.ymcdn.org/api/v2/download/eef9ff80791e5318dcbf27358fc5f02c/Y1Z3Q3O7IRE?_=i1-q9VlbxFziOG8',
      audioUrl:
        'https://c.ymcdn.org/api/v2/download/eef9ff80791e5318dcbf27358fc5f02c/Y1Z3Q3O7IRE?_=GXvuAnvhcXBbnBii',
      coverImage: 'https://i.ytimg.com/vi/Y1Z3Q3O7IRE/hqdefault.jpg',
      musicUrl: null,
      qualities: null,
      originalUrl: null,
      tweetId: null,
      downloadMp3: null,
      downloadArtwork: null,
      platform: 'YouTube',
    },
    ...overrides,
  };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function htmlResponse(): Response {
  return new Response('<html><body>Checking your browser</body></html>', {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });
}

/** Minimal ISO-BMFF ftyp box (32 bytes) — a real MP4 head. */
function mp4Bytes(): Uint8Array {
  const bytes = new Uint8Array(32);
  const dv = new DataView(bytes.buffer);
  dv.setUint32(0, 0x20);
  bytes.set(new TextEncoder().encode('ftyp'), 4);
  bytes.set(new TextEncoder().encode('isom'), 8);
  dv.setUint32(12, 0x200);
  bytes.set(new TextEncoder().encode('isomavc1mp41dash'), 16);
  return bytes;
}

/** ID3v2 header + an MPEG frame sync — a real MP3 head. */
function mp3Bytes(): Uint8Array {
  const bytes = new Uint8Array(256);
  bytes.set(new TextEncoder().encode('ID3'), 0);
  bytes[10] = 0xff;
  bytes[11] = 0xfb;
  return bytes;
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return handler(url, init);
    }),
  );
  return calls;
}

beforeEach(() => {
  resetAlldlNegativeCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetAlldlNegativeCache();
});

describe('parseAlldlPayload', () => {
  it('parses the live envelope and keeps only allowlisted URLs', () => {
    const parsed = parseAlldlPayload(liveEnvelope());
    expect(parsed.videoUrl?.startsWith('https://c.ymcdn.org/')).toBe(true);
    expect(parsed.audioUrl?.startsWith('https://c.ymcdn.org/')).toBe(true);
    expect(parsed.title).toBe('Tobu - Hope (Original Mix)');
    expect(parsed.author).toBe('Tobu');
  });

  it('ignores the promotional links/note fields entirely', () => {
    const parsed = parseAlldlPayload(liveEnvelope());
    expect(JSON.stringify(parsed)).not.toContain('tinyurl');
  });

  it('returns empty for refusals, malformed payloads, and missing mediaInfo', () => {
    expect(parseAlldlPayload(null)).toEqual({});
    expect(parseAlldlPayload('nope')).toEqual({});
    expect(parseAlldlPayload([])).toEqual({});
    expect(parseAlldlPayload({ success: false, mediaInfo: {} })).toEqual({});
    expect(parseAlldlPayload({ success: true })).toEqual({});
    expect(parseAlldlPayload({ success: true, mediaInfo: 'oops' })).toEqual({});
  });

  it('drops download URLs on hosts we do not proxy', () => {
    const parsed = parseAlldlPayload(
      liveEnvelope({
        mediaInfo: {
          videoUrl: 'https://evil.example.com/file.mp4',
          audioUrl: 'http://c.ymcdn.org/insecure.mp3',
        },
      }),
    );
    expect(parsed.videoUrl).toBeUndefined();
    expect(parsed.audioUrl).toBeUndefined();
  });
});

describe('isAllowedAlldlUrl', () => {
  it('accepts exactly the two provider hosts', () => {
    expect(isAllowedAlldlUrl('https://c.ymcdn.org/api/v2/download/x/y?_=z')).toBe(true);
    expect(isAllowedAlldlUrl('https://ahm7xmakki.com/api/alldl?url=x')).toBe(true);
  });

  it('rejects lookalike hosts, subdomains, and non-HTTPS', () => {
    expect(isAllowedAlldlUrl('https://sub.c.ymcdn.org/file.mp4')).toBe(false);
    expect(isAllowedAlldlUrl('https://c.ymcdn.org.evil.example/file.mp4')).toBe(false);
    expect(isAllowedAlldlUrl('https://ymcdn.org/file.mp4')).toBe(false);
    expect(isAllowedAlldlUrl('http://c.ymcdn.org/file.mp4')).toBe(false);
    expect(isAllowedAlldlUrl('not a url')).toBe(false);
  });

  it('keeps the host list in sync with the provider module', () => {
    expect(ALLDL_MEDIA_HOSTS).toEqual(['c.ymcdn.org', 'ahm7xmakki.com']);
  });
});

describe('sniffAlldlContainer', () => {
  it('recognises MP3 (ID3 or MPEG sync) and MP4 (ftyp) heads', () => {
    expect(sniffAlldlContainer(mp3Bytes())).toBe('mp3');
    expect(sniffAlldlContainer(mp4Bytes())).toBe('mp4');
  });

  it('rejects HTML challenge pages, EBML/WebM, and empty bodies', () => {
    expect(sniffAlldlContainer(new TextEncoder().encode('<html><body>hi</body></html>'))).toBe('other');
    expect(sniffAlldlContainer(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]))).toBe('other');
    expect(sniffAlldlContainer(new Uint8Array(0))).toBe('other');
  });
});

describe('alldlFormats', () => {
  it('requests the watch URL and probes the audio link before accepting (mp3)', async () => {
    const audioUrl =
      'https://c.ymcdn.org/api/v2/download/eef9ff80791e5318dcbf27358fc5f02c/Y1Z3Q3O7IRE?_=GXvuAnvhcXBbnBii';
    const calls = stubFetch(url => {
      if (url.startsWith(ALLDL_API_BASE)) return json(liveEnvelope());
      if (url === audioUrl) {
        return new Response(mp3Bytes() as BodyInit, {
          status: 206,
          headers: { 'Content-Type': 'audio/mpeg', 'Content-Range': 'bytes 0-255/4000000' },
        });
      }
      return new Response('{}', { status: 404 });
    });

    const formats = await alldlFormats('Y1Z3Q3O7IRE', 'mp3');
    expect(formats).toHaveLength(1);
    expect(formats[0]).toMatchObject({ url: audioUrl, mimeType: 'audio/mpeg' });

    // Exactly two requests: the single API call + one probe. No retries.
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe(
      `${ALLDL_API_BASE}?url=${encodeURIComponent('https://www.youtube.com/watch?v=Y1Z3Q3O7IRE')}`,
    );
    // The probe is a bounded byte range.
    expect(new Headers(calls[1]?.init?.headers).get('range')).toBe('bytes=0-2047');
  });

  it('probes and accepts a real MP4 head for video requests', async () => {
    const videoUrl =
      'https://c.ymcdn.org/api/v2/download/eef9ff80791e5318dcbf27358fc5f02c/Y1Z3Q3O7IRE?_=i1-q9VlbxFziOG8';
    stubFetch(url => {
      if (url.startsWith(ALLDL_API_BASE)) return json(liveEnvelope());
      if (url === videoUrl) {
        return new Response(mp4Bytes() as BodyInit, { status: 200, headers: { 'Content-Type': 'video/mp4' } });
      }
      return new Response('{}', { status: 404 });
    });

    const formats = await alldlFormats('Y1Z3Q3O7IRE', 'mp4');
    expect(formats).toHaveLength(1);
    expect(formats[0]).toMatchObject({ url: videoUrl, mimeType: 'video/mp4' });
  });

  it('refuses the video link when audio serves the same MP4 bytes (broken rendition routing)', async () => {
    // Verified live 2026-09-01: the two links share one token path and the
    // rotating CDN nodes sometimes serve the same file on both. A healthy
    // answer is videoUrl=MP4 + audioUrl=MP3.
    const videoUrl =
      'https://c.ymcdn.org/api/v2/download/eef9ff80791e5318dcbf27358fc5f02c/Y1Z3Q3O7IRE?_=i1-q9VlbxFziOG8';
    const audioUrl =
      'https://c.ymcdn.org/api/v2/download/eef9ff80791e5318dcbf27358fc5f02c/Y1Z3Q3O7IRE?_=GXvuAnvhcXBbnBii';
    stubFetch(url => {
      if (url.startsWith(ALLDL_API_BASE)) return json(liveEnvelope());
      if (url === videoUrl || url === audioUrl) {
        return new Response(mp4Bytes() as BodyInit, { status: 200, headers: { 'Content-Type': 'video/mp4' } });
      }
      return new Response('{}', { status: 404 });
    });

    const formats = await alldlFormats('Y1Z3Q3O7IRE', 'mp4');
    expect(formats).toEqual([]);
  });

  it('accepts distinct renditions (videoUrl MP4 + audioUrl MP3) for video requests', async () => {
    const videoUrl =
      'https://c.ymcdn.org/api/v2/download/eef9ff80791e5318dcbf27358fc5f02c/Y1Z3Q3O7IRE?_=i1-q9VlbxFziOG8';
    const audioUrl =
      'https://c.ymcdn.org/api/v2/download/eef9ff80791e5318dcbf27358fc5f02c/Y1Z3Q3O7IRE?_=GXvuAnvhcXBbnBii';
    const calls = stubFetch(url => {
      if (url.startsWith(ALLDL_API_BASE)) return json(liveEnvelope());
      if (url === videoUrl) {
        return new Response(mp4Bytes() as BodyInit, { status: 200, headers: { 'Content-Type': 'video/mp4' } });
      }
      if (url === audioUrl) {
        return new Response(mp3Bytes() as BodyInit, { status: 200, headers: { 'Content-Type': 'audio/mpeg' } });
      }
      return new Response('{}', { status: 404 });
    });

    const formats = await alldlFormats('Y1Z3Q3O7IRE', 'mp4');
    expect(formats).toHaveLength(1);
    expect(formats[0].url).toBe(videoUrl);
    // Both renditions were probed before accepting.
    expect(calls.filter(c => c.url === videoUrl || c.url === audioUrl)).toHaveLength(2);
  });

  it('returns nothing (no probe) when the requested kind has no URL', async () => {
    const envelope = liveEnvelope();
    (envelope as Record<string, unknown>).mediaInfo = {
      ...((envelope as Record<string, unknown>).mediaInfo as Record<string, unknown>),
      audioUrl: null,
    };
    const calls = stubFetch(url => (url.startsWith(ALLDL_API_BASE) ? json(envelope) : new Response('{}', { status: 404 })));

    const formats = await alldlFormats('Y1Z3Q3O7IRE', 'mp3');
    expect(formats).toEqual([]);
    expect(calls).toHaveLength(1); // API call only — nothing to probe
  });

  it('discards a candidate whose bytes are an HTML page, not media', async () => {
    const audioUrl = 'https://c.ymcdn.org/api/v2/download/x/Y1Z3Q3O7IRE?_=y';
    stubFetch(url => {
      if (url.startsWith(ALLDL_API_BASE)) return json(liveEnvelope());
      if (url === audioUrl) return htmlResponse();
      return new Response('{}', { status: 404 });
    });

    expect(await alldlFormats('Y1Z3Q3O7IRE', 'mp3')).toEqual([]);
  });

  it('discards a candidate whose container does not match the request', async () => {
    // An audioUrl that is actually an MP4 must not be relabelled as MP3.
    const audioUrl = 'https://c.ymcdn.org/api/v2/download/x/Y1Z3Q3O7IRE?_=y';
    stubFetch(url => {
      if (url.startsWith(ALLDL_API_BASE)) return json(liveEnvelope());
      if (url === audioUrl) {
        return new Response(mp4Bytes() as BodyInit, { status: 200, headers: { 'Content-Type': 'video/mp4' } });
      }
      return new Response('{}', { status: 404 });
    });

    expect(await alldlFormats('Y1Z3Q3O7IRE', 'mp3')).toEqual([]);
  });

  it('makes exactly ONE attempt when the API errors — no retries', async () => {
    const calls = stubFetch(() => new Response('{}', { status: 500 }));
    expect(await alldlFormats('Y1Z3Q3O7IRE', 'mp3')).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('treats an HTML challenge page from the API as nothing', async () => {
    const calls = stubFetch(() => htmlResponse());
    expect(await alldlFormats('Y1Z3Q3O7IRE', 'mp3')).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('treats success:false as nothing', async () => {
    stubFetch(() => json({ success: false, message: 'quota' }));
    expect(await alldlFormats('Y1Z3Q3O7IRE', 'mp3')).toEqual([]);
  });

  it('never fetches for a malformed video id', async () => {
    const calls = stubFetch(() => json(liveEnvelope()));
    expect(await alldlFormats('not-an-id', 'mp3')).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  describe('negative health cache (skip a recently-dead endpoint)', () => {
    it('skips the AllDL hop entirely (no fetch) while the endpoint is in its negative window', async () => {
      // First call: the API 500s, paying the failure once and marking it down.
      let calls = stubFetch(() => new Response('{}', { status: 500 }));
      expect(await alldlFormats('Y1Z3Q3O7IRE', 'mp3')).toEqual([]);
      expect(calls).toHaveLength(1);

      // Second call within the window: no fetch at all — the 12 s timeout is
      // not re-paid, and cobalt/Apify can run without waiting on it.
      calls = stubFetch(() => json(liveEnvelope()));
      expect(await alldlFormats('Y1Z3Q3O7IRE', 'mp3')).toEqual([]);
      expect(calls).toHaveLength(0);
    });

    it('also caches the cooldown on a network/timeout failure', async () => {
      let calls = stubFetch(() => {
        throw new TypeError('fetch failed (timeout)');
      });
      expect(await alldlFormats('Y1Z3Q3O7IRE', 'mp4')).toEqual([]);
      expect(calls).toHaveLength(1);

      calls = stubFetch(() => json(liveEnvelope()));
      expect(await alldlFormats('Y1Z3Q3O7IRE', 'mp4')).toEqual([]);
      expect(calls).toHaveLength(0);
    });

    it('recovers after the negative TTL elapses (endpoint retried)', async () => {
      // Mark the endpoint down...
      const down = stubFetch(() => new Response('{}', { status: 502 }));
      expect(await alldlFormats('Y1Z3Q3O7IRE', 'mp3')).toEqual([]);
      expect(down).toHaveLength(1);

      // ...expire the cooldown...
      const FIVE_MIN_PLUS = 6 * 60 * 1000;
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + FIVE_MIN_PLUS);

      // ...and the endpoint is probed again, serving a healthy envelope.
      const audioUrl =
        'https://c.ymcdn.org/api/v2/download/eef9ff80791e5318dcbf27358fc5f02c/Y1Z3Q3O7IRE?_=GXvuAnvhcXBbnBii';
      const recovered = stubFetch(url => {
        if (url.startsWith(ALLDL_API_BASE)) return json(liveEnvelope());
        if (url === audioUrl) {
          return new Response(mp3Bytes() as BodyInit, {
            status: 206,
            headers: { 'Content-Type': 'audio/mpeg', 'Content-Range': 'bytes 0-255/4000000' },
          });
        }
        return new Response('{}', { status: 404 });
      });
      const formats = await alldlFormats('Y1Z3Q3O7IRE', 'mp3');
      expect(formats).toHaveLength(1);
      expect(formats[0]).toMatchObject({ url: audioUrl });
      expect(recovered.some(c => c.url.startsWith(ALLDL_API_BASE))).toBe(true);
    });

    it('does NOT cache a per-video miss (a healthy 200 with no usable rendition)', async () => {
      // success:false means the endpoint is alive but had nothing for this
      // video. That must not poison the endpoint for the next video.
      let calls = stubFetch(() => json({ success: false, message: 'no result' }));
      expect(await alldlFormats('Y1Z3Q3O7IRE', 'mp3')).toEqual([]);
      expect(calls).toHaveLength(1);

      // A subsequent, different request still hits the API.
      calls = stubFetch(url => {
        if (url.startsWith(ALLDL_API_BASE)) return json(liveEnvelope());
        return new Response(mp3Bytes() as BodyInit, {
          status: 206,
          headers: { 'Content-Type': 'audio/mpeg', 'Content-Range': 'bytes 0-255/4000000' },
        });
      });
      const formats = await alldlFormats('dQw4w9WgXcQ', 'mp3');
      expect(formats).toHaveLength(1);
      expect(calls.some(c => c.url.startsWith(ALLDL_API_BASE))).toBe(true);
    });

    it('does NOT cache a healthy 200 whose candidate only failed the byte probe', async () => {
      // The API answered fine but the CDN candidate sniffs as the wrong
      // container — a per-link/CDN-node flip, not a dead API host. The next
      // request must still query the endpoint so the /api/convert auto-retry
      // (fresh extraction) can self-heal.
      let calls = stubFetch(url => {
        if (url.startsWith(ALLDL_API_BASE)) return json(liveEnvelope());
        // Candidate serves HTML instead of media.
        return htmlResponse();
      });
      expect(await alldlFormats('Y1Z3Q3O7IRE', 'mp3')).toEqual([]);
      expect(calls).toHaveLength(2); // API call + probe

      calls = stubFetch(url => {
        if (url.startsWith(ALLDL_API_BASE)) return json(liveEnvelope());
        return new Response(mp3Bytes() as BodyInit, {
          status: 206,
          headers: { 'Content-Type': 'audio/mpeg', 'Content-Range': 'bytes 0-255/4000000' },
        });
      });
      expect(await alldlFormats('Y1Z3Q3O7IRE', 'mp3')).toHaveLength(1);
      expect(calls.some(c => c.url.startsWith(ALLDL_API_BASE))).toBe(true);
    });
  });
});
