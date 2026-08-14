import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COBALT_DIRECTORY_URL,
  COBALT_DIRECTORY_TTL_MS,
  COBALT_MAX_PUBLIC_ATTEMPTS,
  discoverPublicCobaltApis,
  isPublicDiscoveryEnabled,
  isReviewedCobaltHost,
  normalizeDirectoryEntry,
  parseDirectoryPayload,
  resetCobaltDirectoryCache,
  REVIEWED_COBALT_APIS,
} from './cobalt-directory';

const SAVED_ENV = { ...process.env };

/** A reviewed host, used wherever a test needs an entry that should pass. */
const GOOD = REVIEWED_COBALT_APIS[0];

function directoryResponse(data: unknown): Response {
  return new Response(JSON.stringify({ lastUpdatedUTC: '2026-08-14T09:43:40.869Z', data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  delete process.env.COBALT_PUBLIC_DISCOVERY;
  resetCobaltDirectoryCache();
});

afterEach(() => {
  process.env = { ...SAVED_ENV };
  vi.unstubAllGlobals();
  resetCobaltDirectoryCache();
});

describe('the reviewed allowlist itself', () => {
  it('contains only bare lowercase hostnames', () => {
    for (const host of REVIEWED_COBALT_APIS) {
      expect(host).toBe(host.toLowerCase());
      expect(host).not.toMatch(/[/:?#]/);
      expect(host).toMatch(/^[a-z0-9.-]+\.[a-z]{2,}$/);
    }
  });

  it('excludes the official instances, which forbid third-party API use', () => {
    for (const host of REVIEWED_COBALT_APIS) {
      expect(host).not.toMatch(/(^|\.)cobalt\.tools$/);
      expect(host).not.toMatch(/(^|\.)imput\.net$/);
    }
  });

  it('matches hosts exactly, case-insensitively, and not as a suffix', () => {
    expect(isReviewedCobaltHost(GOOD)).toBe(true);
    expect(isReviewedCobaltHost(GOOD.toUpperCase())).toBe(true);
    expect(isReviewedCobaltHost(`${GOOD}.`)).toBe(true); // trailing root dot
    expect(isReviewedCobaltHost(`evil.${GOOD}`)).toBe(false);
    expect(isReviewedCobaltHost(`${GOOD}.evil.example`)).toBe(false);
    expect(isReviewedCobaltHost('cobalt.directory')).toBe(false);
    expect(isReviewedCobaltHost('')).toBe(false);
  });
});

describe('normalizeDirectoryEntry (SSRF gate on directory data)', () => {
  it('accepts a reviewed bare HTTPS origin, with or without a trailing slash', () => {
    expect(normalizeDirectoryEntry(`https://${GOOD}`)).toBe(`https://${GOOD}`);
    expect(normalizeDirectoryEntry(`https://${GOOD}/`)).toBe(`https://${GOOD}`);
    expect(normalizeDirectoryEntry(`  https://${GOOD}  `)).toBe(`https://${GOOD}`);
    expect(normalizeDirectoryEntry(`https://${GOOD.toUpperCase()}`)).toBe(`https://${GOOD}`);
  });

  it('rejects unreviewed hosts even when the directory says they are healthy', () => {
    // This is the whole point: the directory is a health signal, not trust.
    expect(normalizeDirectoryEntry('https://dog.kittycat.boo')).toBeNull();
    expect(normalizeDirectoryEntry('https://sunny.imput.net')).toBeNull();
    expect(normalizeDirectoryEntry('https://api.cobalt.tools')).toBeNull();
    expect(normalizeDirectoryEntry('https://attacker.example')).toBeNull();
  });

  it('rejects plaintext and non-http schemes', () => {
    expect(normalizeDirectoryEntry(`http://${GOOD}`)).toBeNull();
    expect(normalizeDirectoryEntry(`ftp://${GOOD}`)).toBeNull();
    expect(normalizeDirectoryEntry(`file:///etc/passwd`)).toBeNull();
    expect(normalizeDirectoryEntry(`javascript:alert(1)`)).toBeNull();
  });

  it('rejects credentials embedded in the URL', () => {
    expect(normalizeDirectoryEntry(`https://user:pass@${GOOD}`)).toBeNull();
    expect(normalizeDirectoryEntry(`https://user@${GOOD}`)).toBeNull();
    // A classic confusion payload: the real host is the attacker's.
    expect(normalizeDirectoryEntry(`https://${GOOD}@attacker.example`)).toBeNull();
  });

  it('rejects unexpected ports', () => {
    expect(normalizeDirectoryEntry(`https://${GOOD}:8080`)).toBeNull();
    expect(normalizeDirectoryEntry(`https://${GOOD}:22`)).toBeNull();
    expect(normalizeDirectoryEntry(`https://${GOOD}:25`)).toBeNull();
    expect(normalizeDirectoryEntry(`https://${GOOD}:6379`)).toBeNull();
    // An explicit :443 is normalised away by the URL parser, so it denotes
    // exactly the same origin as the bare host and is accepted. The output is
    // still the canonical portless origin, which is what gets fetched.
    expect(normalizeDirectoryEntry(`https://${GOOD}:443`)).toBe(`https://${GOOD}`);
  });

  it('rejects IP literals and loopback names', () => {
    expect(normalizeDirectoryEntry('https://127.0.0.1')).toBeNull();
    expect(normalizeDirectoryEntry('https://169.254.169.254')).toBeNull();
    expect(normalizeDirectoryEntry('https://10.0.0.5')).toBeNull();
    expect(normalizeDirectoryEntry('https://[::1]')).toBeNull();
    expect(normalizeDirectoryEntry('https://localhost')).toBeNull();
    expect(normalizeDirectoryEntry('https://api.localhost')).toBeNull();
    expect(normalizeDirectoryEntry('https://cobalt.local')).toBeNull();
  });

  it('rejects entries carrying a path, query string, or fragment', () => {
    expect(normalizeDirectoryEntry(`https://${GOOD}/api`)).toBeNull();
    expect(normalizeDirectoryEntry(`https://${GOOD}/?x=1`)).toBeNull();
    expect(normalizeDirectoryEntry(`https://${GOOD}/#frag`)).toBeNull();
    expect(normalizeDirectoryEntry(`https://${GOOD}/tunnel?id=1`)).toBeNull();
  });

  it('rejects malformed, non-string, and oversized values', () => {
    expect(normalizeDirectoryEntry('not a url')).toBeNull();
    expect(normalizeDirectoryEntry('')).toBeNull();
    expect(normalizeDirectoryEntry('   ')).toBeNull();
    expect(normalizeDirectoryEntry(null)).toBeNull();
    expect(normalizeDirectoryEntry(undefined)).toBeNull();
    expect(normalizeDirectoryEntry(42)).toBeNull();
    expect(normalizeDirectoryEntry({ url: `https://${GOOD}` })).toBeNull();
    expect(normalizeDirectoryEntry([`https://${GOOD}`])).toBeNull();
    expect(normalizeDirectoryEntry(`https://${GOOD}/${'a'.repeat(300)}`)).toBeNull();
  });
});

describe('parseDirectoryPayload', () => {
  it('reads only data.youtube, ignoring every other service key', () => {
    const other = REVIEWED_COBALT_APIS[1];
    const origins = parseDirectoryPayload({
      data: {
        youtube: [`https://${GOOD}`],
        // Reviewed, but only listed as healthy for TikTok — irrelevant here.
        tiktok: [`https://${other}`],
        'youtube-shorts': [`https://${other}`],
        'youtube-music': [`https://${other}`],
      },
    });
    expect(origins).toEqual([`https://${GOOD}`]);
  });

  it('drops unreviewed entries while keeping reviewed ones from the same list', () => {
    const origins = parseDirectoryPayload({
      data: {
        youtube: [
          'https://dog.kittycat.boo',
          `https://${GOOD}`,
          'https://sunny.imput.net',
          `http://${REVIEWED_COBALT_APIS[1]}`,
          `https://${REVIEWED_COBALT_APIS[1]}`,
        ],
      },
    });
    expect(origins).toEqual([`https://${GOOD}`, `https://${REVIEWED_COBALT_APIS[1]}`]);
  });

  it('de-duplicates repeated entries', () => {
    const origins = parseDirectoryPayload({
      data: { youtube: [`https://${GOOD}`, `https://${GOOD}/`, `https://${GOOD.toUpperCase()}`] },
    });
    expect(origins).toEqual([`https://${GOOD}`]);
  });

  it('returns nothing for malformed payloads instead of throwing', () => {
    expect(parseDirectoryPayload(null)).toEqual([]);
    expect(parseDirectoryPayload(undefined)).toEqual([]);
    expect(parseDirectoryPayload('nope')).toEqual([]);
    expect(parseDirectoryPayload([])).toEqual([]);
    expect(parseDirectoryPayload({})).toEqual([]);
    expect(parseDirectoryPayload({ data: null })).toEqual([]);
    expect(parseDirectoryPayload({ data: [] })).toEqual([]);
    expect(parseDirectoryPayload({ data: { youtube: 'https://x' } })).toEqual([]);
    expect(parseDirectoryPayload({ data: { youtube: [] } })).toEqual([]);
  });

  it('parses a payload shaped like the real 2026-08-14 directory response', () => {
    // Trimmed copy of the live https://cobalt.directory/api/working?type=api
    // body: many services, the youtube list a strict subset of the rest.
    const origins = parseDirectoryPayload({
      lastUpdatedUTC: '2026-08-14T09:43:40.869Z',
      data: {
        facebook: ['https://dog.kittycat.boo', 'https://nachos.imput.net'],
        youtube: [
          'https://kitty.tame.gg',
          'https://api-cobalt.eversiege.network',
          'https://lime.clxxped.lol',
          'https://apicobalt.mgytr.top',
          'https://cobalt-api.lamps-dev.dev',
          'https://nuko-c.meowing.de',
          'https://bergung-api.hoffnungfuerdiezukunft.net',
        ],
        'youtube-music': ['https://kitty.tame.gg', 'https://subito-c.meowing.de'],
        reddit: ['https://kityune.imput.net'],
      },
    });
    // All seven live YouTube-passing hosts happen to be reviewed today.
    expect(origins).toEqual([...REVIEWED_COBALT_APIS].map(h => `https://${h}`));
  });
});

describe('isPublicDiscoveryEnabled', () => {
  it('is on by default', () => {
    expect(isPublicDiscoveryEnabled()).toBe(true);
  });

  it('accepts several spellings of "off"', () => {
    for (const value of ['0', 'false', 'off', 'no', 'FALSE', ' Off ']) {
      process.env.COBALT_PUBLIC_DISCOVERY = value;
      expect(isPublicDiscoveryEnabled()).toBe(false);
    }
  });

  it('stays on for any other value', () => {
    for (const value of ['1', 'true', 'yes', '']) {
      process.env.COBALT_PUBLIC_DISCOVERY = value;
      expect(isPublicDiscoveryEnabled()).toBe(true);
    }
  });
});

describe('discoverPublicCobaltApis', () => {
  it('queries the documented directory endpoint with a bounded timeout', async () => {
    const fetchMock = vi.fn(async () => directoryResponse({ youtube: [`https://${GOOD}`] }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await discoverPublicCobaltApis()).toEqual([`https://${GOOD}`]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(COBALT_DIRECTORY_URL);
    expect(url).toBe('https://cobalt.directory/api/working?type=api');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('makes no request at all when discovery is opted out', async () => {
    process.env.COBALT_PUBLIC_DISCOVERY = '0';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await discoverPublicCobaltApis()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('caches for five minutes, then refetches', async () => {
    const fetchMock = vi.fn(async () => directoryResponse({ youtube: [`https://${GOOD}`] }));
    vi.stubGlobal('fetch', fetchMock);

    const t0 = 1_000_000;
    await discoverPublicCobaltApis(t0);
    await discoverPublicCobaltApis(t0 + COBALT_DIRECTORY_TTL_MS - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await discoverPublicCobaltApis(t0 + COBALT_DIRECTORY_TTL_MS + 1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent lookups into one request', async () => {
    const fetchMock = vi.fn(async () => directoryResponse({ youtube: [`https://${GOOD}`] }));
    vi.stubGlobal('fetch', fetchMock);
    const [a, b, c] = await Promise.all([
      discoverPublicCobaltApis(),
      discoverPublicCobaltApis(),
      discoverPublicCobaltApis(),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it('returns an empty list (never throws) on transport failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    await expect(discoverPublicCobaltApis()).resolves.toEqual([]);
  });

  it('returns an empty list on an HTTP error or non-JSON body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })));
    expect(await discoverPublicCobaltApis()).toEqual([]);

    resetCobaltDirectoryCache();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>oops</html>', { status: 200 })));
    expect(await discoverPublicCobaltApis()).toEqual([]);
  });

  it('does not re-hammer the directory after a failure', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('network down'); });
    vi.stubGlobal('fetch', fetchMock);
    const t0 = 2_000_000;
    await discoverPublicCobaltApis(t0);
    await discoverPublicCobaltApis(t0 + 1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never returns a host that is not reviewed, whatever the directory says', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => directoryResponse({
      youtube: [
        'https://attacker.example',
        'http://169.254.169.254',
        `https://${GOOD}@attacker.example`,
        'https://localhost:8080',
        `https://${GOOD}`,
      ],
    })));
    expect(await discoverPublicCobaltApis()).toEqual([`https://${GOOD}`]);
  });

  it('bounds the attempt count constant to something small', () => {
    expect(COBALT_MAX_PUBLIC_ATTEMPTS).toBeGreaterThan(0);
    expect(COBALT_MAX_PUBLIC_ATTEMPTS).toBeLessThanOrEqual(3);
  });
});
