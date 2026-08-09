import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ALL_CONVERTERS,
  checkConverterUrl,
  getConverterByName,
  statusFromHttpStatus,
} from './converters';

function httpResponse(status: number) {
  return { status, body: { cancel: async () => {} } };
}

function timeoutError(): Error {
  return Object.assign(new Error('timed out'), { name: 'TimeoutError' });
}

function networkError(): Error {
  return Object.assign(new Error('fetch failed'), { name: 'TypeError' });
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('catalog', () => {
  it('exports the full converter list with unique names', () => {
    expect(ALL_CONVERTERS.length).toBeGreaterThan(0);
    const names = ALL_CONVERTERS.map(c => c.name);
    expect(new Set(names).size).toBe(names.length);
    for (const converter of ALL_CONVERTERS) {
      expect(converter.url).toMatch(/^https:\/\//);
      expect(converter.platforms.length).toBeGreaterThan(0);
      expect(converter.formats.length).toBeGreaterThan(0);
    }
  });

  it('looks converters up by name', () => {
    expect(getConverterByName('SaveInsta')?.url).toBe('https://saveinsta.to/en1');
    expect(getConverterByName('FastDL')?.url).toBe('https://fastdl.app/en4');
    expect(getConverterByName('Y2Mate')).toBeUndefined();
    expect(getConverterByName('Does Not Exist')).toBeUndefined();
  });
});

describe('statusFromHttpStatus', () => {
  it('treats 2xx and 3xx as working', () => {
    for (const status of [200, 204, 301, 302, 304, 399]) {
      expect(statusFromHttpStatus(status)).toBe('working');
    }
  });

  it('treats 4xx/5xx as unavailable', () => {
    for (const status of [400, 401, 403, 404, 429, 500, 502, 503]) {
      expect(statusFromHttpStatus(status)).toBe('unavailable');
    }
  });
});

describe('checkConverterUrl', () => {
  it('reports working when HEAD succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValue(httpResponse(200));
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkConverterUrl('https://example.com/');
    expect(result.status).toBe('working');
    expect(result.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].method).toBe('HEAD');
  });

  it('falls back to GET when HEAD is rejected', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(httpResponse(405))
      .mockResolvedValueOnce(httpResponse(200));
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkConverterUrl('https://example.com/');
    expect(result.status).toBe('working');
    expect(result.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].method).toBe('GET');
  });

  it('falls back to GET when HEAD throws (connection refused)', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(networkError())
      .mockResolvedValueOnce(httpResponse(200));
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkConverterUrl('https://example.com/');
    expect(result.status).toBe('working');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports unavailable when the site answers 404', async () => {
    const fetchMock = vi.fn().mockResolvedValue(httpResponse(404));
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkConverterUrl('https://example.com/gone');
    expect(result.status).toBe('unavailable');
    expect(result.statusCode).toBe(404);
  });

  it('reports unavailable with a timeout message when both probes time out', async () => {
    const fetchMock = vi.fn().mockRejectedValue(timeoutError());
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkConverterUrl('https://example.com/');
    expect(result.status).toBe('unavailable');
    expect(result.error).toBe('Timed out');
  });

  it('reports unavailable with a connection message on network errors', async () => {
    const fetchMock = vi.fn().mockRejectedValue(networkError());
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkConverterUrl('https://example.com/');
    expect(result.status).toBe('unavailable');
    expect(result.error).toBe('Could not connect');
  });
});
