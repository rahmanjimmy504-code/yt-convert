import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetPoTokenCacheForTests,
  getPoToken,
  isPoTokenServerConfigured,
} from './po-token';
import { isValidPoToken, isValidVisitorData } from './po-token-contract';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const SAVED_ENV = { ...process.env };

/** Shape-valid visitorData / WebPO samples (not real tokens). */
const VD = 'Cgs3YzRtdWpnTkJCbyjgoba3Bg==';
const POT = 'Mmjb9zC7RXJtz9vL00XCYxJie5NonEefv5jAsItnbjBeUCwwgD4MpibO3o6lDesALHIKU7WgElG';

beforeEach(() => {
  __resetPoTokenCacheForTests();
  delete process.env.PO_TOKEN_SERVER_URL;
  delete process.env.PO_TOKEN_SERVER_AUTH;
});

afterEach(() => {
  process.env = { ...SAVED_ENV };
  vi.unstubAllGlobals();
  __resetPoTokenCacheForTests();
});

describe('token shape (no arbitrary-length workaround)', () => {
  it('accepts observed visitorData / WebPO shapes', () => {
    expect(isValidVisitorData(VD)).toBe(true);
    expect(isValidPoToken(POT)).toBe(true);
  });

  it('rejects short, long, or non-base64 tokens', () => {
    expect(isValidPoToken('short')).toBe(false);
    expect(isValidPoToken('A'.repeat(80))).toBe(false); // repeated junk
    expect(isValidPoToken('!!!'.repeat(30))).toBe(false);
    expect(isValidPoToken('AbCd'.repeat(200))).toBe(false); // too long
    expect(isValidVisitorData('abc')).toBe(false);
  });
});

describe('isPoTokenServerConfigured', () => {
  it('is false when either variable is missing', () => {
    expect(isPoTokenServerConfigured()).toBe(false);
    process.env.PO_TOKEN_SERVER_URL = 'https://token.example';
    expect(isPoTokenServerConfigured()).toBe(false);
    process.env.PO_TOKEN_SERVER_AUTH = 'secret';
    expect(isPoTokenServerConfigured()).toBe(true);
  });

  it('rejects non-http(s) URLs', () => {
    process.env.PO_TOKEN_SERVER_URL = 'ftp://token.example';
    process.env.PO_TOKEN_SERVER_AUTH = 'secret';
    expect(isPoTokenServerConfigured()).toBe(false);
  });
});

describe('getPoToken', () => {
  it('returns null when the server is not configured', async () => {
    expect(await getPoToken()).toBeNull();
  });

  it('POSTs videoId, client, and context to the sidecar', async () => {
    process.env.PO_TOKEN_SERVER_URL = 'https://token.example';
    process.env.PO_TOKEN_SERVER_AUTH = 'test-auth-token';
    const fetchMock = vi.fn(async () => jsonResponse({ visitorData: VD, poToken: POT }));
    vi.stubGlobal('fetch', fetchMock);

    const token = await getPoToken({
      videoId: 'dQw4w9WgXcQ',
      client: 'ANDROID',
      context: 'player',
    });
    expect(token).toMatchObject({ visitorData: VD, poToken: POT, context: 'player' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://token.example/api/token');
    expect(init.method).toBe('POST');
    const headers = new Headers(init.headers as HeadersInit);
    expect(headers.get('authorization')).toBe('Bearer test-auth-token');
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ videoId: 'dQw4w9WgXcQ', client: 'ANDROID', context: 'player' });
  });

  it('rejects a payload whose token fails shape validation', async () => {
    process.env.PO_TOKEN_SERVER_URL = 'https://token.example';
    process.env.PO_TOKEN_SERVER_AUTH = 'secret';
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ visitorData: 'VD', poToken: 'PO' })));
    expect(await getPoToken()).toBeNull();
  });

  it('accepts snake_case field names when they pass shape checks', async () => {
    process.env.PO_TOKEN_SERVER_URL = 'https://token.example';
    process.env.PO_TOKEN_SERVER_AUTH = 'secret';
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ visitor_data: VD, po_token: POT })));
    const token = await getPoToken();
    expect(token).toMatchObject({ visitorData: VD, poToken: POT });
  });

  it('caches the token and coalesces concurrent calls', async () => {
    process.env.PO_TOKEN_SERVER_URL = 'https://token.example';
    process.env.PO_TOKEN_SERVER_AUTH = 'secret';
    const fetchMock = vi.fn(async () => jsonResponse({ visitorData: VD, poToken: POT }));
    vi.stubGlobal('fetch', fetchMock);

    const [a, b, c] = await Promise.all([getPoToken(), getPoToken(), getPoToken()]);
    expect(a?.visitorData).toBe(VD);
    expect(b?.visitorData).toBe(VD);
    expect(c?.visitorData).toBe(VD);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await getPoToken();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns null on HTTP failure and does not throw', async () => {
    process.env.PO_TOKEN_SERVER_URL = 'https://token.example';
    process.env.PO_TOKEN_SERVER_AUTH = 'secret';
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'boom' }, 500)));
    expect(await getPoToken()).toBeNull();
  });
});
