import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cobaltAuthHeader,
  cobaltConfigFromEnv,
  cobaltErrorText,
  cobaltFormats,
  isCobaltConfigured,
} from './cobalt';

const SAVED_ENV = { ...process.env };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  delete process.env.COBALT_API_URL;
  delete process.env.COBALT_API_AUTH;
});

afterEach(() => {
  process.env = { ...SAVED_ENV };
  vi.unstubAllGlobals();
});

describe('cobaltConfigFromEnv', () => {
  it('is null when unset, disabling the fallback', () => {
    expect(cobaltConfigFromEnv()).toBeNull();
    expect(isCobaltConfigured()).toBe(false);
  });

  it('trims trailing slashes so POST hits the instance root', () => {
    process.env.COBALT_API_URL = 'https://cobalt.example.com///';
    expect(cobaltConfigFromEnv()).toEqual({ url: 'https://cobalt.example.com' });
  });

  it('rejects non-http(s) URLs', () => {
    process.env.COBALT_API_URL = 'ftp://cobalt.example.com';
    expect(cobaltConfigFromEnv()).toBeNull();
  });

  it('carries the auth token when present', () => {
    process.env.COBALT_API_URL = 'https://cobalt.example.com';
    process.env.COBALT_API_AUTH = 'secret';
    expect(cobaltConfigFromEnv()).toEqual({ url: 'https://cobalt.example.com', auth: 'secret' });
  });
});

describe('cobaltAuthHeader', () => {
  it('defaults a bare token to the Bearer scheme', () => {
    expect(cobaltAuthHeader('abc123')).toBe('Bearer abc123');
  });

  it('preserves an explicit scheme', () => {
    expect(cobaltAuthHeader('Api-Key aaaa-bbbb')).toBe('Api-Key aaaa-bbbb');
    expect(cobaltAuthHeader('Bearer eyJhbGci')).toBe('Bearer eyJhbGci');
  });
});

describe('cobaltErrorText', () => {
  it('reads the nested v11 error code', () => {
    expect(cobaltErrorText({ status: 'error', error: { code: 'error.api.youtube.login' } })).toBe(
      'error.api.youtube.login',
    );
  });

  it('falls back to a bare text field', () => {
    expect(cobaltErrorText({ status: 'error', text: 'something broke' })).toBe('something broke');
  });

  it('never returns an empty string', () => {
    expect(cobaltErrorText({ status: 'error' })).toMatch(/refused/i);
  });
});

describe('cobaltFormats', () => {
  it('returns nothing when no instance is configured (no request made)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await cobaltFormats('https://youtu.be/abc', 'video')).toEqual({ formats: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs v11-style to the instance root with the required headers', async () => {
    process.env.COBALT_API_URL = 'https://cobalt.example.com';
    process.env.COBALT_API_AUTH = 'secret';
    const fetchMock = vi.fn(async () =>
      jsonResponse({ status: 'tunnel', url: 'https://cobalt.example.com/tunnel?id=1' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await cobaltFormats('https://www.youtube.com/watch?v=abc', 'video');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    // v11 uses POST / on the root; the pre-v10 /api/json path is gone.
    expect(url).toBe('https://cobalt.example.com');
    expect(url).not.toMatch(/\/api\/json/);
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Accept).toBe('application/json');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.Authorization).toBe('Bearer secret');
    expect(JSON.parse(String(init.body))).toMatchObject({
      url: 'https://www.youtube.com/watch?v=abc',
      downloadMode: 'auto',
    });
  });

  it('requests an mp3 audio download for audio kind', async () => {
    process.env.COBALT_API_URL = 'https://cobalt.example.com';
    const fetchMock = vi.fn(async () =>
      jsonResponse({ status: 'tunnel', url: 'https://cobalt.example.com/tunnel?id=2' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await cobaltFormats('https://youtu.be/abc', 'audio');
    const body = JSON.parse(
      String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body),
    );
    expect(body).toMatchObject({ downloadMode: 'audio', audioFormat: 'mp3' });
    expect(result.formats[0].mimeType).toBe('audio/mpeg');
  });

  it('handles a redirect response', async () => {
    process.env.COBALT_API_URL = 'https://cobalt.example.com';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ status: 'redirect', url: 'https://rr1.googlevideo.com/x' })),
    );
    const result = await cobaltFormats('https://youtu.be/abc', 'video');
    expect(result.formats).toHaveLength(1);
    expect(result.formats[0]).toMatchObject({
      url: 'https://rr1.googlevideo.com/x',
      mimeType: 'video/mp4',
    });
  });

  it('picks the first video entry from a picker response', async () => {
    process.env.COBALT_API_URL = 'https://cobalt.example.com';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          status: 'picker',
          picker: [
            { type: 'photo', url: 'https://cobalt.example.com/photo.jpg' },
            { type: 'video', url: 'https://cobalt.example.com/video.mp4' },
          ],
        }),
      ),
    );
    const result = await cobaltFormats('https://youtu.be/abc', 'video');
    expect(result.formats[0].url).toBe('https://cobalt.example.com/video.mp4');
  });

  it('prefers the background audio track of a picker for audio requests', async () => {
    process.env.COBALT_API_URL = 'https://cobalt.example.com';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          status: 'picker',
          audio: 'https://cobalt.example.com/audio.mp3',
          picker: [{ type: 'video', url: 'https://cobalt.example.com/video.mp4' }],
        }),
      ),
    );
    const result = await cobaltFormats('https://youtu.be/abc', 'audio');
    expect(result.formats[0].url).toBe('https://cobalt.example.com/audio.mp3');
  });

  it('surfaces the nested error code from an error response', async () => {
    process.env.COBALT_API_URL = 'https://cobalt.example.com';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ status: 'error', error: { code: 'error.api.youtube.login' } }, 400),
      ),
    );
    const result = await cobaltFormats('https://youtu.be/abc', 'video');
    expect(result.formats).toHaveLength(0);
    expect(result.error).toBe('error.api.youtube.login');
  });

  it('reports local-processing as unusable rather than pretending it worked', async () => {
    process.env.COBALT_API_URL = 'https://cobalt.example.com';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ status: 'local-processing', type: 'merge', tunnel: ['https://a', 'https://b'] }),
      ),
    );
    const result = await cobaltFormats('https://youtu.be/abc', 'video');
    expect(result.formats).toHaveLength(0);
    expect(result.error).toMatch(/local-processing/i);
  });

  it('never throws when the instance is unreachable', async () => {
    process.env.COBALT_API_URL = 'https://cobalt.example.com';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    await expect(cobaltFormats('https://youtu.be/abc', 'video')).resolves.toEqual({ formats: [] });
  });
});
