import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  apifyConfigFromEnv,
  apifyErrorText,
  apifyFormats,
  apifyVideoQuality,
  attachApifyToken,
  buildActorInput,
  DEFAULT_APIFY_ACTOR_BUILD,
  DEFAULT_APIFY_ACTOR_ID,
  isApifyConfigured,
  monthlyUsageUsdFromLimits,
  parseActorBuild,
  parseMonthlyCapUsd,
  parseResidentialProxyMode,
  parseRunTimeoutS,
  pickDownloadUrl,
  sanitizeNetscapeCookieFile,
} from './apify';

const SAVED_ENV = { ...process.env };

const TOKEN = 'apify-token-unit-test';
const PAGE_URL = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
const DOWNLOAD_URL =
  'https://api.apify.com/v2/key-value-stores/abc123/records/jNQXAC9IVRw.mp4';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function limitsBody(usedUsd: number): unknown {
  // Shape documented at https://docs.apify.com/api/v2/users-me-limits-get
  return {
    data: {
      monthlyUsageCycle: { startAt: '2026-08-02T00:00:00.000Z', endAt: '2026-09-01T23:59:59.999Z' },
      limits: { maxMonthlyUsageUsd: 300 },
      current: { monthlyUsageUsd: usedUsd },
    },
  };
}

function successItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    videoId: 'jNQXAC9IVRw',
    title: 'Me at the zoo',
    originalUrl: PAGE_URL,
    quality: '1080p',
    format: 'MP4',
    fileSize: '45.2 MB',
    fileSizeBytes: 47395225,
    downloadUrl: DOWNLOAD_URL,
    kvStoreKey: 'jNQXAC9IVRw.mp4',
    contentType: 'video/mp4',
    status: 'success',
    ...overrides,
  };
}

/** Record every fetch and answer the two Apify endpoints from fixtures. */
function stubApify(options: {
  usedUsd?: number;
  limitsStatus?: number;
  runBody?: unknown;
  runStatus?: number;
  runThrows?: Error;
}) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.startsWith('https://api.apify.com/v2/users/me/limits')) {
        if (options.limitsStatus && options.limitsStatus !== 200) {
          return jsonResponse({ error: { type: 'invalid-token', message: 'Nope' } }, options.limitsStatus);
        }
        return jsonResponse(limitsBody(options.usedUsd ?? 0));
      }
      if (url.includes('/run-sync-get-dataset-items')) {
        if (options.runThrows) throw options.runThrows;
        return jsonResponse(options.runBody ?? [successItem()], options.runStatus ?? 200);
      }
      return new Response('{}', { status: 404 });
    }),
  );
  return calls;
}

beforeEach(() => {
  delete process.env.APIFY_TOKEN;
  delete process.env.APIFY_ACTOR_ID;
  delete process.env.APIFY_ACTOR_BUILD;
  delete process.env.APIFY_MONTHLY_CAP_USD;
  delete process.env.APIFY_RUN_TIMEOUT_S;
  delete process.env.APIFY_PROXY_HOSTS;
  delete process.env.APIFY_YOUTUBE_COOKIES;
  delete process.env.APIFY_RESIDENTIAL_PROXY_MODE;
  process.env.APIFY_TOKEN = TOKEN;
});

afterEach(() => {
  process.env = { ...SAVED_ENV };
  vi.unstubAllGlobals();
});

describe('apifyConfigFromEnv', () => {
  it('is null (fallback disabled) when APIFY_TOKEN is unset', () => {
    delete process.env.APIFY_TOKEN;
    expect(apifyConfigFromEnv()).toBeNull();
    expect(isApifyConfigured()).toBe(false);
  });

  it('defaults to the reviewed Actor, build 0.064, an $8 cap and a 90 s run timeout', () => {
    expect(apifyConfigFromEnv()).toEqual({
      token: TOKEN,
      actorId: DEFAULT_APIFY_ACTOR_ID,
      build: DEFAULT_APIFY_ACTOR_BUILD,
      monthlyCapUsd: 8,
      runTimeoutS: 90,
    });
    expect(DEFAULT_APIFY_ACTOR_ID).toBe('marielise.dev~youtube-video-downloader');
    expect(DEFAULT_APIFY_ACTOR_BUILD).toBe('0.064');
  });

  it('honours operator overrides', () => {
    process.env.APIFY_ACTOR_ID = 'someone~another-downloader';
    process.env.APIFY_ACTOR_BUILD = '0.070';
    process.env.APIFY_MONTHLY_CAP_USD = '2.50';
    process.env.APIFY_RUN_TIMEOUT_S = '120';
    expect(apifyConfigFromEnv()).toEqual({
      token: TOKEN,
      actorId: 'someone~another-downloader',
      build: '0.070',
      monthlyCapUsd: 2.5,
      runTimeoutS: 120,
    });
  });

  it('accepts an internal actor id but rejects path metacharacters', () => {
    process.env.APIFY_ACTOR_ID = 'ZSKNl5eniyeAPcPkf';
    expect(apifyConfigFromEnv()?.actorId).toBe('ZSKNl5eniyeAPcPkf');
    // The actor id is interpolated into a URL path, so these must disable
    // the fallback rather than be passed through.
    for (const bad of ['../v2/logs', 'a b', 'actor?x=1', 'actor#frag', 'user/name', '*']) {
      process.env.APIFY_ACTOR_ID = bad;
      expect(apifyConfigFromEnv(), `actor id "${bad}"`).toBeNull();
    }
  });

  it('bridges a valid APIFY_YOUTUBE_COOKIES into the config', () => {
    process.env.APIFY_YOUTUBE_COOKIES = '.youtube.com\tTRUE\t/\tTRUE\t0\tPREF\thello';
    const config = apifyConfigFromEnv();
    expect(config).not.toBeNull();
    expect(config?.youtubeCookies).toBe('.youtube.com\tTRUE\t/\tTRUE\t0\tPREF\thello');
  });

  it('omits youtubeCookies when unset or blank, keeping the config shape unchanged', () => {
    expect(apifyConfigFromEnv()).not.toHaveProperty('youtubeCookies');
    process.env.APIFY_YOUTUBE_COOKIES = '   ';
    expect(apifyConfigFromEnv()).not.toHaveProperty('youtubeCookies');
  });

  it('warns and runs WITHOUT cookies when the value is not a cookies.txt file', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.APIFY_YOUTUBE_COOKIES = 'PREF=hello; VISITOR_INFO1_LIVE=abc';
    const config = apifyConfigFromEnv();
    expect(config).not.toBeNull();
    expect(config).not.toHaveProperty('youtubeCookies');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('APIFY_YOUTUBE_COOKIES is set but is not a Netscape cookies.txt'),
    );
    warn.mockRestore();
  });
});

describe('sanitizeNetscapeCookieFile (APIFY_YOUTUBE_COOKIES bridge)', () => {
  const NETSCAPE_FILE = [
    '# Netscape HTTP Cookie File',
    '# This is a generated file! Do not edit.',
    '',
    '.youtube.com\tTRUE\t/\tTRUE\t2147483647\tVISITOR_INFO1_LIVE\tabc123',
    '.youtube.com\tTRUE\t/\tTRUE\t0\tPREF\thello=world',
    '#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t0\tLOGIN_INFO\tsession',
  ].join('\n');

  it('accepts a real Netscape cookies.txt and preserves it verbatim', () => {
    expect(sanitizeNetscapeCookieFile(NETSCAPE_FILE)).toBe(NETSCAPE_FILE);
  });

  it('normalizes CRLF line endings from Windows exports', () => {
    expect(sanitizeNetscapeCookieFile(NETSCAPE_FILE.replace(/\n/g, '\r\n'))).toBe(NETSCAPE_FILE);
  });

  it('returns null for empty or whitespace-only input', () => {
    expect(sanitizeNetscapeCookieFile('')).toBeNull();
    expect(sanitizeNetscapeCookieFile('   \n  ')).toBeNull();
    expect(sanitizeNetscapeCookieFile(undefined)).toBeNull();
    expect(sanitizeNetscapeCookieFile(null)).toBeNull();
  });

  it('rejects a bare Cookie header paste (no Netscape tab-separated line)', () => {
    // yt-dlp would silently run anonymously on this — refuse it instead.
    expect(sanitizeNetscapeCookieFile('VISITOR_INFO1_LIVE=abc123; PREF=hello=world')).toBeNull();
  });

  it('rejects control characters (corrupted or hostile paste)', () => {
    expect(sanitizeNetscapeCookieFile('.youtube.com\tTRUE\t/\tTRUE\t0\ta\u0000b\tv')).toBeNull();
    expect(sanitizeNetscapeCookieFile('.youtube.com\tTRUE\t/\tTRUE\t0\ta\u001Fb\tv')).toBeNull();
    // A lone \r (not part of CRLF) is corrupt, not a line ending.
    expect(sanitizeNetscapeCookieFile('.youtube.com\tTRUE\t/\tTRUE\t0\ta\rv')).toBeNull();
  });

  it('rejects oversized files beyond the 64 KiB cap', () => {
    const line = `.youtube.com\tTRUE\t/\tTRUE\t0\tNAME\t${'v'.repeat(64)}`;
    const big = Array.from({ length: 1200 }, () => line).join('\n');
    expect(big.length).toBeGreaterThan(65_536);
    expect(sanitizeNetscapeCookieFile(big)).toBeNull();
  });

  it('rejects files with comment lines only', () => {
    expect(sanitizeNetscapeCookieFile('# Netscape HTTP Cookie File\n# no data\n')).toBeNull();
  });
});

describe('parseMonthlyCapUsd', () => {
  it('keeps the default for empty, negative, or non-numeric input', () => {
    expect(parseMonthlyCapUsd('')).toBe(8);
    expect(parseMonthlyCapUsd(undefined)).toBe(8);
    expect(parseMonthlyCapUsd('-5')).toBe(8);
    expect(parseMonthlyCapUsd('eight')).toBe(8);
  });

  it('honours 0 as the operator off switch and clamps nothing else', () => {
    expect(parseMonthlyCapUsd('0')).toBe(0);
    expect(parseMonthlyCapUsd('12.5')).toBe(12.5);
  });
});

describe('parseRunTimeoutS', () => {
  it('clamps into the sync endpoint 30–300 s range', () => {
    expect(parseRunTimeoutS('')).toBe(90);
    expect(parseRunTimeoutS('5')).toBe(30);
    expect(parseRunTimeoutS('999')).toBe(300);
    expect(parseRunTimeoutS('150')).toBe(150);
    expect(parseRunTimeoutS('bogus')).toBe(90);
  });
});

describe('parseActorBuild', () => {
  it('keeps the default for blank input', () => {
    expect(parseActorBuild('')).toBe('0.064');
    expect(parseActorBuild(undefined)).toBe('0.064');
    expect(parseActorBuild('   ')).toBe('0.064');
  });

  it('accepts plain build tags, including "latest"', () => {
    expect(parseActorBuild('0.064')).toBe('0.064');
    expect(parseActorBuild('0.070')).toBe('0.070');
    expect(parseActorBuild('latest')).toBe('latest');
    expect(parseActorBuild('beta-1.2')).toBe('beta-1.2');
    expect(parseActorBuild('  0.070  ')).toBe('0.070');
  });

  it('falls back to the default on query metacharacters (injection guard)', () => {
    expect(parseActorBuild('0.064&evil=1')).toBe('0.064');
    expect(parseActorBuild('0.064?x=1')).toBe('0.064');
    expect(parseActorBuild('0.064#frag')).toBe('0.064');
    expect(parseActorBuild('0.064/x')).toBe('0.064');
    expect(parseActorBuild('a b')).toBe('0.064');
    expect(parseActorBuild('0.064=x')).toBe('0.064');
  });
});

describe('parseResidentialProxyMode', () => {
  it('omits residential proxy mode by default and for anything except exact fallback', () => {
    expect(parseResidentialProxyMode(undefined)).toBeUndefined();
    expect(parseResidentialProxyMode('')).toBeUndefined();
    expect(parseResidentialProxyMode('off')).toBeUndefined();
    expect(parseResidentialProxyMode('FALLBACK')).toBeUndefined();
    expect(parseResidentialProxyMode(' fallback ')).toBeUndefined();
    expect(parseResidentialProxyMode('fallback')).toBe('fallback');
  });

  it('adds the mode to config only when APIFY_RESIDENTIAL_PROXY_MODE=fallback', () => {
    expect(apifyConfigFromEnv()).not.toHaveProperty('residentialProxyMode');
    process.env.APIFY_RESIDENTIAL_PROXY_MODE = 'fallback';
    expect(apifyConfigFromEnv()).toMatchObject({ residentialProxyMode: 'fallback' });
    process.env.APIFY_RESIDENTIAL_PROXY_MODE = 'always';
    expect(apifyConfigFromEnv()).not.toHaveProperty('residentialProxyMode');
  });
});

describe('apifyVideoQuality', () => {
  it('maps the app options onto the Actor ceiling, best -> 1080', () => {
    expect(apifyVideoQuality('best')).toBe('1080');
    expect(apifyVideoQuality('1080')).toBe('1080');
    expect(apifyVideoQuality('720')).toBe('720');
    expect(apifyVideoQuality('480')).toBe('480');
    expect(apifyVideoQuality('360')).toBe('360');
    expect(apifyVideoQuality(undefined)).toBe('1080');
    expect(apifyVideoQuality('320')).toBe('1080');
  });
});

describe('buildActorInput', () => {
  it('asks for audio-only MP3 with a single URL', () => {
    expect(buildActorInput(PAGE_URL, 'audio')).toEqual({
      urls: [{ url: PAGE_URL }],
      format: 'mp3',
    });
  });

  it('asks for progressive MP4 and passes the quality ceiling', () => {
    expect(buildActorInput(PAGE_URL, 'video', '720')).toEqual({
      urls: [{ url: PAGE_URL }],
      format: 'default',
      quality: '720',
    });
    expect(buildActorInput(PAGE_URL, 'video', 'best').quality).toBe('1080');
    // The Actor ignores quality for MP3, so it is not sent.
    expect(buildActorInput(PAGE_URL, 'audio', '320')).not.toHaveProperty('quality');
  });

  it('bridges youtubeCookies only when configured, keeping the shape stable otherwise', () => {
    expect(buildActorInput(PAGE_URL, 'audio')).not.toHaveProperty('youtubeCookies');
    const cookies = '.youtube.com\tTRUE\t/\tTRUE\t0\tPREF\thello';
    expect(buildActorInput(PAGE_URL, 'video', '720', cookies)).toEqual({
      urls: [{ url: PAGE_URL }],
      format: 'default',
      quality: '720',
      youtubeCookies: cookies,
    });
    // An empty cookie value must not add an empty field.
    expect(buildActorInput(PAGE_URL, 'audio', undefined, '')).not.toHaveProperty('youtubeCookies');
  });

  it('omits residentialProxyMode by default and sends it only on explicit opt-in', () => {
    expect(buildActorInput(PAGE_URL, 'video', '720')).not.toHaveProperty('residentialProxyMode');
    expect(buildActorInput(PAGE_URL, 'audio', undefined, undefined, 'fallback')).toEqual({
      urls: [{ url: PAGE_URL }],
      format: 'mp3',
      residentialProxyMode: 'fallback',
    });
  });
});

describe('pickDownloadUrl', () => {
  it('returns the downloadUrl of a successful item', () => {
    expect(pickDownloadUrl([successItem()])).toEqual({
      url: DOWNLOAD_URL,
      qualityLabel: '1080p',
    });
  });

  it('surfaces the Actor failure reason', () => {
    const items = [successItem({
      status: 'failed',
      downloadUrl: '',
      error: 'This is a private video and cannot be downloaded.',
    })];
    expect(pickDownloadUrl(items)).toEqual({ error: 'This is a private video and cannot be downloaded.' });
  });

  it('treats status "error" as a failure too', () => {
    expect(pickDownloadUrl([{ status: 'error', error: 'quota' }])).toEqual({ error: 'quota' });
  });

  it('skips failed items and still uses a later successful one', () => {
    const items = [
      { status: 'failed', downloadUrl: '', error: 'blocked' },
      successItem({ downloadUrl: 'https://api.apify.com/v2/key-value-stores/x/records/y.mp3' }),
    ];
    const picked = pickDownloadUrl(items);
    expect('error' in picked ? undefined : picked.url)
      .toBe('https://api.apify.com/v2/key-value-stores/x/records/y.mp3');
  });

  it('accepts the snake_case spelling of the URL field', () => {
    const items = [{ status: 'success', download_url: 'https://api.apify.com/v2/key-value-stores/x/records/a.mp4' }];
    const picked = pickDownloadUrl(items);
    expect('error' in picked ? undefined : picked.url)
      .toBe('https://api.apify.com/v2/key-value-stores/x/records/a.mp4');
  });

  it('reports success items that carry no usable URL', () => {
    expect(pickDownloadUrl([{ status: 'success', downloadUrl: '' }])).toEqual({
      error: 'status "success" without a downloadUrl',
    });
    // A non-HTTPS URL is not usable by the proxy, so it is not returned.
    expect('error' in pickDownloadUrl([{ status: 'success', downloadUrl: 'http://api.apify.com/x' }])).toBe(true);
  });

  it('rejects empty, non-array, and object responses', () => {
    const empty = pickDownloadUrl([]);
    expect('error' in empty ? empty.error : '').toMatch(/no dataset items/);
    expect('error' in pickDownloadUrl(null)).toBe(true);
    expect('error' in pickDownloadUrl({})).toBe(true);
    const validation = pickDownloadUrl({ error: { type: 'x', message: 'Input validation failed' } });
    expect('error' in validation ? validation.error : '').toBe('Input validation failed');
  });
});

describe('monthlyUsageUsdFromLimits', () => {
  it('reads data.current.monthlyUsageUsd', () => {
    expect(monthlyUsageUsdFromLimits(limitsBody(7.31))).toBe(7.31);
  });

  it('returns null for anything unreadable (which must mean "skip the run")', () => {
    expect(monthlyUsageUsdFromLimits(null)).toBeNull();
    expect(monthlyUsageUsdFromLimits({})).toBeNull();
    expect(monthlyUsageUsdFromLimits({ data: {} })).toBeNull();
    expect(monthlyUsageUsdFromLimits({ data: { current: {} } })).toBeNull();
    expect(monthlyUsageUsdFromLimits({ data: { current: { monthlyUsageUsd: '7' } } })).toBeNull();
    expect(monthlyUsageUsdFromLimits({ data: { current: { monthlyUsageUsd: -1 } } })).toBeNull();
    expect(monthlyUsageUsdFromLimits({ data: { current: { monthlyUsageUsd: Infinity } } })).toBeNull();
  });
});

describe('apifyErrorText', () => {
  it('prefers the message, then the type, then the bare value', () => {
    expect(apifyErrorText({ error: { type: 'invalid-token', message: 'Token is not valid.' } }))
      .toBe('Token is not valid.');
    expect(apifyErrorText({ error: { type: 'invalid-token' } })).toBe('invalid-token');
    expect(apifyErrorText({ error: 'plain string' })).toBe('plain string');
    expect(apifyErrorText({})).toBe('');
  });
});

describe('attachApifyToken', () => {
  it('appends the token to api.apify.com record URLs', () => {
    expect(attachApifyToken(DOWNLOAD_URL, TOKEN)).toBe(`${DOWNLOAD_URL}?token=${TOKEN}`);
  });

  it('keeps an existing token or signature untouched', () => {
    expect(attachApifyToken(`${DOWNLOAD_URL}?signature=abc`, TOKEN))
      .toBe(`${DOWNLOAD_URL}?signature=abc`);
    expect(attachApifyToken(`${DOWNLOAD_URL}?token=other`, TOKEN)).toBe(`${DOWNLOAD_URL}?token=other`);
  });

  it('never sends the token to another host', () => {
    expect(attachApifyToken('https://files.example.com/a.mp4', TOKEN))
      .toBe('https://files.example.com/a.mp4');
    expect(attachApifyToken('https://api.apify.com.evil.example/a.mp4', TOKEN))
      .toBe('https://api.apify.com.evil.example/a.mp4');
    expect(attachApifyToken('not a url', TOKEN)).toBe('not a url');
  });
});

describe('apifyFormats (the paid path is opt-in, capped, and single-run)', () => {
  it('does nothing at all when APIFY_TOKEN is unset', async () => {
    delete process.env.APIFY_TOKEN;
    const calls = stubApify({});
    const result = await apifyFormats(PAGE_URL, 'video', 'best');
    expect(result.formats).toEqual([]);
    expect(result.error).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it('never makes any API call when the cap is 0 (operator off switch)', async () => {
    process.env.APIFY_MONTHLY_CAP_USD = '0';
    const calls = stubApify({});
    const result = await apifyFormats(PAGE_URL, 'video', 'best');
    expect(result.formats).toEqual([]);
    expect(result.error).toMatch(/disabled/);
    expect(calls).toHaveLength(0);
  });

  it('checks the monthly usage and then performs exactly ONE run', async () => {
    const calls = stubApify({ usedUsd: 0.42 });
    const result = await apifyFormats(PAGE_URL, 'video', '720');

    // Exactly two requests: the limits check, then one Actor run.
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe('https://api.apify.com/v2/users/me/limits');
    expect(calls[1].url).toBe(
      `https://api.apify.com/v2/acts/${DEFAULT_APIFY_ACTOR_ID}/run-sync-get-dataset-items?timeout=90&build=0.064`,
    );
    expect(calls[1].url.endsWith('?timeout=90&build=0.064')).toBe(true);

    // The token travels in the Authorization header, not the URL.
    const auth = (init?: RequestInit) => new Headers(init?.headers).get('authorization');
    expect(auth(calls[0].init)).toBe(`Bearer ${TOKEN}`);
    expect(auth(calls[1].init)).toBe(`Bearer ${TOKEN}`);

    // The run body follows the Actor input schema.
    expect(calls[1].init?.method).toBe('POST');
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({
      urls: [{ url: PAGE_URL }],
      format: 'default',
      quality: '720',
    });

    expect(result.formats).toHaveLength(1);
    expect(result.formats[0]).toMatchObject({
      url: `${DOWNLOAD_URL}?token=${TOKEN}`,
      mimeType: 'video/mp4',
      qualityLabel: '1080p',
    });
  });

  it('builds an audio-only MP3 request and result', async () => {
    const calls = stubApify({
      runBody: [successItem({
        format: 'MP3',
        quality: '',
        contentType: 'audio/mpeg',
        downloadUrl: 'https://api.apify.com/v2/key-value-stores/x/records/a.mp3',
        kvStoreKey: 'a.mp3',
      })],
    });
    const result = await apifyFormats(PAGE_URL, 'audio', '320');
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({
      urls: [{ url: PAGE_URL }],
      format: 'mp3',
    });
    expect(result.formats[0]).toMatchObject({
      url: 'https://api.apify.com/v2/key-value-stores/x/records/a.mp3?token=' + TOKEN,
      mimeType: 'audio/mpeg',
    });
  });

  it('bridges APIFY_YOUTUBE_COOKIES into the run body when set', async () => {
    const cookies = '.youtube.com\tTRUE\t/\tTRUE\t0\tPREF\thello';
    process.env.APIFY_YOUTUBE_COOKIES = cookies;
    const calls = stubApify({ usedUsd: 0 });
    await apifyFormats(PAGE_URL, 'video', '720');
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({
      urls: [{ url: PAGE_URL }],
      format: 'default',
      quality: '720',
      youtubeCookies: cookies,
    });
  });

  it('keeps the default run body free of optional paid/cookie fields', async () => {
    const calls = stubApify({ usedUsd: 0 });
    await apifyFormats(PAGE_URL, 'video', '720');
    const body = JSON.parse(String(calls[1].init?.body));
    expect(body).not.toHaveProperty('youtubeCookies');
    expect(body).not.toHaveProperty('residentialProxyMode');
  });

  it('passes residentialProxyMode only when explicitly set to fallback', async () => {
    process.env.APIFY_RESIDENTIAL_PROXY_MODE = 'fallback';
    let calls = stubApify({ usedUsd: 0 });
    await apifyFormats(PAGE_URL, 'video', '720');
    expect(JSON.parse(String(calls[1].init?.body))).toMatchObject({ residentialProxyMode: 'fallback' });

    vi.unstubAllGlobals();
    process.env.APIFY_RESIDENTIAL_PROXY_MODE = 'always';
    calls = stubApify({ usedUsd: 0 });
    await apifyFormats(PAGE_URL, 'video', '720');
    expect(JSON.parse(String(calls[1].init?.body))).not.toHaveProperty('residentialProxyMode');
  });

  it('passes the configured run timeout and actor id to the run URL', async () => {
    process.env.APIFY_RUN_TIMEOUT_S = '45';
    process.env.APIFY_ACTOR_ID = 'someone~another-downloader';
    const calls = stubApify({ usedUsd: 0 });
    await apifyFormats(PAGE_URL, 'video', 'best');
    expect(calls[1].url).toBe(
      'https://api.apify.com/v2/acts/someone~another-downloader/run-sync-get-dataset-items?timeout=45&build=0.064',
    );
  });

  it('pins the run to build 0.070 (not 0.064) when APIFY_ACTOR_BUILD is set', async () => {
    process.env.APIFY_ACTOR_BUILD = '0.070';
    const calls = stubApify({ usedUsd: 0 });
    await apifyFormats(PAGE_URL, 'video', 'best');
    expect(calls[1].url).toBe(
      `https://api.apify.com/v2/acts/${DEFAULT_APIFY_ACTOR_ID}/run-sync-get-dataset-items?timeout=90&build=0.070`,
    );
    expect(calls[1].url).not.toContain('build=0.064');
  });

  it('falls back to build 0.064 with no injected params when APIFY_ACTOR_BUILD is unsafe', async () => {
    process.env.APIFY_ACTOR_BUILD = '0.064&evil=1';
    const calls = stubApify({ usedUsd: 0 });
    await apifyFormats(PAGE_URL, 'video', 'best');
    expect(calls[1].url).toBe(
      `https://api.apify.com/v2/acts/${DEFAULT_APIFY_ACTOR_ID}/run-sync-get-dataset-items?timeout=90&build=0.064`,
    );
    expect(calls[1].url).not.toContain('evil');
  });

  it('skips the run entirely when monthly usage has reached the cap', async () => {
    process.env.APIFY_MONTHLY_CAP_USD = '8';
    const calls = stubApify({ usedUsd: 8.0 });
    const result = await apifyFormats(PAGE_URL, 'video', 'best');
    expect(result.formats).toEqual([]);
    expect(result.error).toMatch(/reached the \$8\.00 cap/);
    // The Actor was never started, so nothing is billed.
    expect(calls.filter(c => c.url.includes('/acts/'))).toHaveLength(0);
  });

  it('still runs when usage is just below the cap', async () => {
    process.env.APIFY_MONTHLY_CAP_USD = '8';
    const calls = stubApify({ usedUsd: 7.99 });
    const result = await apifyFormats(PAGE_URL, 'video', 'best');
    expect(result.formats).toHaveLength(1);
    expect(calls.filter(c => c.url.includes('/acts/'))).toHaveLength(1);
  });

  it('fails closed when the usage check cannot be completed', async () => {
    const calls = stubApify({ limitsStatus: 500 });
    const result = await apifyFormats(PAGE_URL, 'video', 'best');
    expect(result.formats).toEqual([]);
    expect(result.error).toMatch(/usage check failed \(limits HTTP 500\)/);
    expect(calls.filter(c => c.url.includes('/acts/'))).toHaveLength(0);
  });

  it('names the token when the limits call says it is invalid', async () => {
    const calls = stubApify({ limitsStatus: 401 });
    const result = await apifyFormats(PAGE_URL, 'video', 'best');
    expect(result.error).toMatch(/check APIFY_TOKEN/);
    expect(calls).toHaveLength(1);
  });

  it('fails closed when the limits endpoint is unreachable', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        throw new Error('network down');
      }),
    );
    const result = await apifyFormats(PAGE_URL, 'video', 'best');
    expect(result.error).toMatch(/limits endpoint unreachable/);
    expect(calls).toHaveLength(1);
  });

  it('surfaces an HTTP refusal from the run without retrying', async () => {
    const calls = stubApify({
      runStatus: 400,
      runBody: { error: { type: 'invalid-input', message: 'Input validation failed: urls' } },
    });
    const result = await apifyFormats(PAGE_URL, 'video', 'best');
    expect(result.formats).toEqual([]);
    expect(result.error).toMatch(/HTTP 400.*Input validation failed: urls/);
    // Exactly one run: a refused run is not retried, so it is billed once.
    expect(calls.filter(c => c.url.includes('/acts/'))).toHaveLength(1);
  });

  it('points the operator at APIFY_ACTOR_ID on a 404', async () => {
    stubApify({ runStatus: 404, runBody: { error: { message: 'Actor not found' } } });
    const result = await apifyFormats(PAGE_URL, 'video', 'best');
    expect(result.error).toMatch(/check APIFY_ACTOR_ID/);
  });

  it('reports a rate limit distinctly from a refusal', async () => {
    stubApify({ runStatus: 429 });
    const result = await apifyFormats(PAGE_URL, 'video', 'best');
    expect(result.error).toMatch(/rate limited \(HTTP 429\)/);
  });

  it('reports a timed-out run as an error', async () => {
    stubApify({ runStatus: 408 });
    const result = await apifyFormats(PAGE_URL, 'video', 'best');
    expect(result.error).toMatch(/did not finish within 90s/);
  });

  it('never throws when api.apify.com is unreachable mid-run', async () => {
    stubApify({ runThrows: new Error('network down') });
    const result = await apifyFormats(PAGE_URL, 'video', 'best');
    expect(result.formats).toEqual([]);
    expect(result.error).toMatch(/unreachable/);
  });

  it('reports a failed dataset item as the Actor failure reason', async () => {
    stubApify({
      runBody: [successItem({ status: 'failed', downloadUrl: '', error: 'Video is private' })],
    });
    const result = await apifyFormats(PAGE_URL, 'video', 'best');
    expect(result.formats).toEqual([]);
    expect(result.error).toBe('Video is private');
  });

  it('reports an empty dataset as no result', async () => {
    stubApify({ runBody: [] });
    const result = await apifyFormats(PAGE_URL, 'video', 'best');
    expect(result.error).toMatch(/no dataset items/);
  });

  it('does not attach the token to a downloadUrl on another host', async () => {
    stubApify({
      runBody: [successItem({ downloadUrl: 'https://files.example.com/out.mp4' })],
    });
    const result = await apifyFormats(PAGE_URL, 'video', 'best');
    expect(result.formats[0].url).toBe('https://files.example.com/out.mp4');
  });
});
