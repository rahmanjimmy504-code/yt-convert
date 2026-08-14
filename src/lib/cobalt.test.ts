import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cobaltAuthHeader,
  cobaltConfigFromEnv,
  cobaltErrorText,
  cobaltFormats,
  interpretCobaltPayload,
  isCobaltConfigured,
} from './cobalt';
import {
  COBALT_MAX_PUBLIC_ATTEMPTS,
  resetCobaltDirectoryCache,
  REVIEWED_COBALT_APIS,
} from './cobalt-directory';

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
  // Default the unit tests to the private-instance path. Public discovery is
  // exercised explicitly in its own describe block below, so that a test
  // stubbing one fetch call isn't surprised by a directory lookup.
  process.env.COBALT_PUBLIC_DISCOVERY = '0';
  resetCobaltDirectoryCache();
});

afterEach(() => {
  process.env = { ...SAVED_ENV };
  vi.unstubAllGlobals();
  resetCobaltDirectoryCache();
});

describe('cobaltConfigFromEnv', () => {
  it('is null when unset', () => {
    expect(cobaltConfigFromEnv()).toBeNull();
  });

  it('leaves the fallback enabled via public discovery when no private URL is set', () => {
    delete process.env.COBALT_PUBLIC_DISCOVERY;
    expect(cobaltConfigFromEnv()).toBeNull();
    expect(isCobaltConfigured()).toBe(true);
  });

  it('is fully disabled when there is no private URL and discovery is off', () => {
    process.env.COBALT_PUBLIC_DISCOVERY = '0';
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
  it('makes no request when nothing is configured and discovery is off', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await cobaltFormats('https://youtu.be/abc', 'video')).toEqual({
      formats: [],
      error: undefined,
    });
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
    // Prefixed with the host so an operator reading logs knows which
    // instance refused, while still preserving the raw cobalt code.
    expect(result.error).toBe('cobalt.example.com: error.api.youtube.login');
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

  it('reports a rate limit distinctly from a refusal', async () => {
    process.env.COBALT_API_URL = 'https://cobalt.example.com';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('slow down', { status: 429 })));
    const result = await cobaltFormats('https://youtu.be/abc', 'video');
    expect(result.error).toMatch(/rate limited \(HTTP 429\)/);
  });

  it('never throws when the instance is unreachable', async () => {
    process.env.COBALT_API_URL = 'https://cobalt.example.com';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    const result = await cobaltFormats('https://youtu.be/abc', 'video');
    expect(result.formats).toEqual([]);
    expect(result.error).toMatch(/unreachable/);
  });
});

describe('interpretCobaltPayload (every documented v11 status)', () => {
  it('handles tunnel and redirect', () => {
    expect(interpretCobaltPayload({ status: 'tunnel', url: 'https://a/x' }, 'video').formats[0])
      .toMatchObject({ url: 'https://a/x', mimeType: 'video/mp4' });
    expect(interpretCobaltPayload({ status: 'redirect', url: 'https://a/y' }, 'audio').formats[0])
      .toMatchObject({ url: 'https://a/y', mimeType: 'audio/mpeg' });
  });

  it('reports a tunnel/redirect with no url rather than returning an empty format', () => {
    const result = interpretCobaltPayload({ status: 'tunnel' }, 'video');
    expect(result.formats).toHaveLength(0);
    expect(result.error).toMatch(/tunnel without a url/);
  });

  it('skips photo entries in a picker', () => {
    const result = interpretCobaltPayload({
      status: 'picker',
      picker: [
        { type: 'photo', url: 'https://a/1.jpg' },
        { type: 'photo', url: 'https://a/2.jpg' },
        { type: 'video', url: 'https://a/3.mp4' },
      ],
    }, 'video');
    expect(result.formats[0].url).toBe('https://a/3.mp4');
  });

  it('reports a picker with nothing usable', () => {
    const result = interpretCobaltPayload({
      status: 'picker',
      picker: [{ type: 'photo', url: 'https://a/1.jpg' }],
    }, 'video');
    expect(result.formats).toHaveLength(0);
    expect(result.error).toMatch(/no usable video entry/);
  });

  it('refuses local-processing, which the byte proxy cannot remux', () => {
    const result = interpretCobaltPayload({
      status: 'local-processing',
      type: 'merge',
      tunnel: ['https://a/v', 'https://a/a'],
    }, 'video');
    expect(result.formats).toHaveLength(0);
    expect(result.error).toMatch(/local-processing/);
  });

  it('preserves the error code for diagnostics', () => {
    expect(interpretCobaltPayload(
      { status: 'error', error: { code: 'error.api.auth.turnstile.missing' } }, 'video',
    ).error).toBe('error.api.auth.turnstile.missing');
    expect(interpretCobaltPayload(
      { status: 'error', error: { code: 'error.api.rate_exceeded', context: { limit: 60 } } }, 'video',
    ).error).toBe('error.api.rate_exceeded');
  });

  it('reports an unknown or missing status instead of silently returning nothing', () => {
    expect(interpretCobaltPayload({ status: 'teapot' }, 'video').error).toMatch(/unexpected status/);
    expect(interpretCobaltPayload({}, 'video').error).toMatch(/malformed/);
  });
});

describe('cobaltFormats with public discovery', () => {
  const DIRECTORY = 'https://cobalt.directory/api/working?type=api';
  const A = REVIEWED_COBALT_APIS[0];
  const B = REVIEWED_COBALT_APIS[1];
  const C = REVIEWED_COBALT_APIS[2];
  const D = REVIEWED_COBALT_APIS[3];

  beforeEach(() => {
    delete process.env.COBALT_PUBLIC_DISCOVERY;
    resetCobaltDirectoryCache();
  });

  /** Route the directory call and per-instance POSTs to canned answers. */
  function stubNetwork(youtube: string[], perHost: Record<string, unknown | (() => never)>) {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      calls.push(url);
      if (url === DIRECTORY) {
        return jsonResponse({ data: { youtube } });
      }
      const host = new URL(url).hostname;
      const answer = perHost[host];
      if (typeof answer === 'function') answer();
      if (answer === undefined) throw new Error(`unexpected host ${host}`);
      return jsonResponse(answer);
    });
    vi.stubGlobal('fetch', fetchMock);
    return { calls, fetchMock };
  }

  it('uses a reviewed public instance when nothing is configured', async () => {
    stubNetwork([`https://${A}`], {
      [A]: { status: 'tunnel', url: `https://${A}/tunnel?id=1` },
    });
    const result = await cobaltFormats('https://www.youtube.com/watch?v=jNQXAC9IVRw', 'video');
    expect(result.formats[0].url).toBe(`https://${A}/tunnel?id=1`);
  });

  it('falls through to the remaining candidates when the first one fails', async () => {
    const { calls } = stubNetwork([`https://${A}`, `https://${B}`, `https://${C}`], {
      [A]: { status: 'error', error: { code: 'error.api.auth.turnstile.missing' } },
      [B]: { status: 'error', error: { code: 'error.api.youtube.login' } },
      [C]: { status: 'tunnel', url: `https://${C}/tunnel?id=9` },
    });
    const result = await cobaltFormats('https://youtu.be/jNQXAC9IVRw', 'audio');
    expect(result.formats[0].url).toBe(`https://${C}/tunnel?id=9`);
    // All three were actually attempted, concurrently.
    expect(calls.filter(u => u !== DIRECTORY)).toHaveLength(3);
  });

  it('never attempts more than the bounded number of public instances', async () => {
    const { calls } = stubNetwork(
      [`https://${A}`, `https://${B}`, `https://${C}`, `https://${D}`],
      Object.fromEntries(
        [A, B, C, D].map(h => [h, { status: 'error', error: { code: 'error.api.fetch.fail' } }]),
      ),
    );
    await cobaltFormats('https://youtu.be/jNQXAC9IVRw', 'video');
    expect(calls.filter(u => u !== DIRECTORY)).toHaveLength(COBALT_MAX_PUBLIC_ATTEMPTS);
  });

  it('prefers a real cobalt error code over a bare transport failure', async () => {
    stubNetwork([`https://${A}`, `https://${B}`], {
      [A]: () => { throw new Error('socket hang up'); },
      [B]: { status: 'error', error: { code: 'error.api.youtube.login' } },
    });
    const result = await cobaltFormats('https://youtu.be/jNQXAC9IVRw', 'video');
    expect(result.formats).toHaveLength(0);
    expect(result.error).toContain('error.api.youtube.login');
    expect(result.error).toContain(B);
  });

  it('tries the private instance first and skips discovery once it succeeds', async () => {
    process.env.COBALT_API_URL = 'https://cobalt.private.example';
    const { calls } = stubNetwork([`https://${A}`], {
      'cobalt.private.example': { status: 'tunnel', url: 'https://cobalt.private.example/tunnel?id=3' },
      [A]: { status: 'tunnel', url: `https://${A}/tunnel?id=4` },
    });
    const result = await cobaltFormats('https://youtu.be/jNQXAC9IVRw', 'video');
    expect(result.formats[0].url).toBe('https://cobalt.private.example/tunnel?id=3');
    expect(calls).not.toContain(DIRECTORY);
  });

  it('falls back to public instances when an UNauthenticated private one fails', async () => {
    process.env.COBALT_API_URL = 'https://cobalt.private.example';
    stubNetwork([`https://${A}`], {
      'cobalt.private.example': { status: 'error', error: { code: 'error.api.fetch.fail' } },
      [A]: { status: 'tunnel', url: `https://${A}/tunnel?id=5` },
    });
    const result = await cobaltFormats('https://youtu.be/jNQXAC9IVRw', 'video');
    expect(result.formats[0].url).toBe(`https://${A}/tunnel?id=5`);
  });

  it('never spills the URL to public instances when private auth is configured', async () => {
    process.env.COBALT_API_URL = 'https://cobalt.private.example';
    process.env.COBALT_API_AUTH = 'Api-Key secret';
    const { calls } = stubNetwork([`https://${A}`], {
      'cobalt.private.example': { status: 'error', error: { code: 'error.api.youtube.login' } },
      [A]: { status: 'tunnel', url: `https://${A}/tunnel?id=6` },
    });
    const result = await cobaltFormats('https://youtu.be/jNQXAC9IVRw', 'video');
    expect(result.formats).toHaveLength(0);
    expect(calls).toEqual(['https://cobalt.private.example']);
  });

  it('does not query the directory when discovery is opted out', async () => {
    process.env.COBALT_PUBLIC_DISCOVERY = '0';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await cobaltFormats('https://youtu.be/jNQXAC9IVRw', 'video');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not send the same request twice when the private URL is also a public candidate', async () => {
    process.env.COBALT_API_URL = `https://${A}`;
    const { calls } = stubNetwork([`https://${A}`, `https://${B}`], {
      [A]: { status: 'error', error: { code: 'error.api.fetch.fail' } },
      [B]: { status: 'tunnel', url: `https://${B}/tunnel?id=7` },
    });
    const result = await cobaltFormats('https://youtu.be/jNQXAC9IVRw', 'video');
    expect(result.formats[0].url).toBe(`https://${B}/tunnel?id=7`);
    expect(calls.filter(u => u === `https://${A}`)).toHaveLength(1);
  });

  it('returns no formats (not a crash) when the directory is empty', async () => {
    stubNetwork([], {});
    const result = await cobaltFormats('https://youtu.be/jNQXAC9IVRw', 'video');
    expect(result.formats).toEqual([]);
  });

  it('only ever posts to reviewed hosts, even if the directory lies', async () => {
    const { calls } = stubNetwork(
      ['https://attacker.example', 'http://169.254.169.254', `https://${A}`],
      { [A]: { status: 'tunnel', url: `https://${A}/tunnel?id=8` } },
    );
    await cobaltFormats('https://youtu.be/jNQXAC9IVRw', 'video');
    for (const url of calls) {
      if (url === DIRECTORY) continue;
      expect(REVIEWED_COBALT_APIS).toContain(new URL(url).hostname);
    }
  });
});
