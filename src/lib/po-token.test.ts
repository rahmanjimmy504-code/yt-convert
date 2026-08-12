import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetPoTokenCacheForTests,
  getPoToken,
  isPoTokenServerConfigured,
} from './po-token';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const SAVED_ENV = { ...process.env };

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

  it('fetches and returns a token, sending the bearer auth', async () => {
    process.env.PO_TOKEN_SERVER_URL = 'https://token.example';
    process.env.PO_TOKEN_SERVER_AUTH = 'test-auth-token';
    const fetchMock = vi.fn(async () =>
      jsonResponse({ visitorData: 'VD123', poToken: 'POT456' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const token = await getPoToken();
    expect(token).toMatchObject({ visitorData: 'VD123', poToken: 'POT456' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://token.example/api/token');
    const headers = new Headers(init.headers as HeadersInit);
    expect(headers.get('authorization')).toBe('Bearer test-auth-token');
  });

  it('accepts snake_case field names from alternative generators', async () => {
    process.env.PO_TOKEN_SERVER_URL = 'https://token.example';
    process.env.PO_TOKEN_SERVER_AUTH = 'secret';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ visitor_data: 'VD', po_token: 'PO' })),
    );
    const token = await getPoToken();
    expect(token).toMatchObject({ visitorData: 'VD', poToken: 'PO' });
  });

  it('unwraps a { response: {...} } envelope', async () => {
    process.env.PO_TOKEN_SERVER_URL = 'https://token.example';
    process.env.PO_TOKEN_SERVER_AUTH = 'secret';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ success: true, response: { visitorData: 'VD', poToken: 'PO' } }),
      ),
    );
    expect(await getPoToken()).toMatchObject({ visitorData: 'VD', poToken: 'PO' });
  });

  it('caches the token and coalesces concurrent calls', async () => {
    process.env.PO_TOKEN_SERVER_URL = 'https://token.example';
    process.env.PO_TOKEN_SERVER_AUTH = 'secret';
    const fetchMock = vi.fn(async () =>
      jsonResponse({ visitorData: 'VD', poToken: 'PO' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const [a, b, c] = await Promise.all([getPoToken(), getPoToken(), getPoToken()]);
    expect(a).toMatchObject({ visitorData: 'VD' });
    expect(b).toMatchObject({ visitorData: 'VD' });
    expect(c).toMatchObject({ visitorData: 'VD' });
    // Only one in-flight request despite three concurrent callers.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A later call is served from cache without another fetch.
    await getPoToken();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns null on HTTP failure and does not throw', async () => {
    process.env.PO_TOKEN_SERVER_URL = 'https://token.example';
    process.env.PO_TOKEN_SERVER_AUTH = 'secret';
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'boom' }, 500)));
    expect(await getPoToken()).toBeNull();
  });

  it('returns null when the payload is missing token fields', async () => {
    process.env.PO_TOKEN_SERVER_URL = 'https://token.example';
    process.env.PO_TOKEN_SERVER_AUTH = 'secret';
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ something: 'else' })));
    expect(await getPoToken()).toBeNull();
  });
});
