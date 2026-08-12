import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as videoInfo } from './route';
import { GET as convert } from '../convert/route';

const BASE_VIDEO_ID = 'dQw4w9WgXcQ';
const IP = '203.0.113.45';

// The video-info route caches by `platform|url`, so give each test a unique
// URL (the extra query param varies the cache key) to guarantee a fresh
// ticket per test. The YouTube id is still extracted from `v=`.
let counter = 0;
function uniqueUrl(): string {
  counter += 1;
  return `https://www.youtube.com/watch?v=${BASE_VIDEO_ID}&_=${counter}`;
}

// Minimal, signed local proof token (matching src/lib/captcha.ts) minted
// directly so the test does not depend on rendering/reading a challenge image.
function mintCaptchaToken(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createHmac, randomBytes } = require('node:crypto');
  const secret = process.env.CAPTCHA_SECRET as string;
  const payload = `${randomBytes(18).toString('base64url')}.${Date.now() + 600_000}`;
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Innertube player payload: one progressive MP4 (itag 22, 720p) plus an
// audio-only m4a (itag 140), both on allowlisted googlevideo.com hosts.
const INNERTUBE = {
  playabilityStatus: { status: 'OK' },
  streamingData: {
    formats: [
      {
        url: 'https://rr1---sn-test.googlevideo.com/videoplayback?id=v720',
        mimeType: 'video/mp4; codecs="avc1.64001F, mp4a.40.2"',
        qualityLabel: '720p',
        audioQuality: 'AUDIO_QUALITY_MEDIUM',
        bitrate: 2_500_000,
        height: 720,
        itag: 22,
      },
    ],
    adaptiveFormats: [
      {
        url: 'https://rr2---sn-test.googlevideo.com/videoplayback?id=a128',
        mimeType: 'audio/mp4; codecs="mp4a.40.2"',
        audioQuality: 'AUDIO_QUALITY_MEDIUM',
        bitrate: 128_000,
        itag: 140,
      },
    ],
  },
};

// Invidious-style payload (fallback) with the same streams.
const INVIDIOUS = {
  title: 'Integration Test Video',
  author: 'Tester',
  lengthSeconds: 212,
  viewCount: 1234,
  published: 1_700_000_000,
  formatStreams: [
    {
      url: 'https://rr1---sn-test.googlevideo.com/videoplayback?id=v720',
      type: 'video/mp4; codecs="avc1.64001F, mp4a.40.2"',
      qualityLabel: '720p',
      bitrate: 2_500_000,
      itag: 22,
    },
  ],
  adaptiveFormats: [
    {
      url: 'https://rr2---sn-test.googlevideo.com/videoplayback?id=a128',
      type: 'audio/mp4; codecs="mp4a.40.2"',
      bitrate: 128_000,
      itag: 140,
    },
  ],
};

async function lookup(rawUrl: string, captchaToken: string): Promise<Response> {
  const req = new Request(
    'http://localhost/api/video-info?url=' + encodeURIComponent(rawUrl),
    { headers: { 'X-Captcha-Token': captchaToken, 'X-Forwarded-For': IP } },
  );
  return videoInfo(req);
}

describe('convert ticket flow (integration)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const u = String(input);
        if (u.includes('youtubei/v1/player')) {
          return jsonResponse(INNERTUBE);
        }
        if (u.includes('youtube.com/oembed')) {
          return jsonResponse({ title: 'oEmbed Title', author_name: 'oEmbed Author' });
        }
        if (u.includes('/api/v1/videos/') || u.includes('invidious')) {
          return jsonResponse(INVIDIOUS);
        }
        if (u.includes('googlevideo.com')) {
          // The proxied media stream.
          return new Response(new Uint8Array([0x00, 0x00, 0x00, 0x18]), {
            headers: { 'Content-Type': 'video/mp4', 'Content-Length': '4' },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('issues a convert ticket for a convertible platform after CAPTCHA', async () => {
    const res = await lookup(uniqueUrl(), mintCaptchaToken());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { canConvert?: boolean; convertTicket?: string; convertReason?: string };
    expect(body.canConvert).toBe(true);
    expect(typeof body.convertTicket).toBe('string');
    expect((body.convertTicket || '').length).toBeGreaterThan(10);
    expect(body.convertReason).toBeUndefined();
  });

  it('rejects /api/convert without a ticket (403)', async () => {
    const req = new Request(
      'http://localhost/api/convert?url=' + encodeURIComponent(uniqueUrl()) + '&format=mp4',
      { headers: { 'X-Forwarded-For': IP } },
    );
    const res = await convert(req);
    expect(res.status).toBe(403);
  });

  it('does not issue a ticket for a DRM platform', async () => {
    const token = mintCaptchaToken();
    const req = new Request(
      'http://localhost/api/video-info?url=' +
        encodeURIComponent('https://open.spotify.com/track/123'),
      { headers: { 'X-Captcha-Token': token, 'X-Forwarded-For': IP } },
    );
    const res = await videoInfo(req);
    const body = (await res.json()) as { canConvert?: boolean; convertTicket?: string };
    expect(res.status).toBe(200);
    expect(body.canConvert).toBe(false);
    expect(body.convertTicket).toBeUndefined();
  });

  it('accepts a valid ticket and proxies the stream with the real extension', async () => {
    const rawUrl = uniqueUrl();
    const infoRes = await lookup(rawUrl, mintCaptchaToken());
    const info = (await infoRes.json()) as { convertTicket: string };

    const downloadUrl =
      'http://localhost/api/convert?url=' +
      encodeURIComponent(rawUrl) +
      '&format=mp4&quality=720&ticket=' +
      encodeURIComponent(info.convertTicket) +
      '&title=Test';
    const req = new Request(downloadUrl, { headers: { 'X-Forwarded-For': IP } });
    const res = await convert(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/video\/mp4/);
    const disposition = res.headers.get('content-disposition') || '';
    expect(disposition).toMatch(/attachment/);
    // Filename extension must reflect the real container (mp4 here) — AAC is
    // never mislabeled as .mp3.
    expect(disposition).toMatch(/\.mp4/);

    const buf = new Uint8Array(await res.arrayBuffer());
    expect(buf.length).toBe(4);
  });

  it('rejects a tampered ticket', async () => {
    const rawUrl = uniqueUrl();
    const infoRes = await lookup(rawUrl, mintCaptchaToken());
    const info = (await infoRes.json()) as { convertTicket: string };
    // Flip the last character of the signature.
    const tampered = info.convertTicket.slice(0, -1) +
      (info.convertTicket.endsWith('A') ? 'B' : 'A');

    const req = new Request(
      'http://localhost/api/convert?url=' +
        encodeURIComponent(rawUrl) +
        '&format=mp4&ticket=' +
        encodeURIComponent(tampered),
      { headers: { 'X-Forwarded-For': IP } },
    );
    const res = await convert(req);
    expect(res.status).toBe(403);
  });

  it('rejects a ticket used against a different URL', async () => {
    const rawUrlA = uniqueUrl();
    const infoRes = await lookup(rawUrlA, mintCaptchaToken());
    const info = (await infoRes.json()) as { convertTicket: string };

    const req = new Request(
      'http://localhost/api/convert?url=' +
        encodeURIComponent(uniqueUrl()) +
        '&format=mp4&ticket=' +
        encodeURIComponent(info.convertTicket),
      { headers: { 'X-Forwarded-For': IP } },
    );
    const res = await convert(req);
    expect(res.status).toBe(403);
  });

  it('rejects a ticket used from a different IP', async () => {
    const rawUrl = uniqueUrl();
    const infoRes = await lookup(rawUrl, mintCaptchaToken());
    const info = (await infoRes.json()) as { convertTicket: string };

    const req = new Request(
      'http://localhost/api/convert?url=' +
        encodeURIComponent(rawUrl) +
        '&format=mp4&ticket=' +
        encodeURIComponent(info.convertTicket),
      { headers: { 'X-Forwarded-For': '198.51.100.77' } },
    );
    const res = await convert(req);
    expect(res.status).toBe(403);
  });
});
