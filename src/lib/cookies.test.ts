import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_SECONDS,
  getConsentChoice,
  parseCookieHeader,
  readCookie,
  setConsentChoice,
} from './cookies';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseCookieHeader', () => {
  it('returns null for empty input', () => {
    expect(parseCookieHeader(null, 'a')).toBeNull();
    expect(parseCookieHeader(undefined, 'a')).toBeNull();
    expect(parseCookieHeader('', 'a')).toBeNull();
  });

  it('reads a single cookie', () => {
    expect(parseCookieHeader(`${CONSENT_COOKIE}=accepted`, CONSENT_COOKIE)).toBe('accepted');
  });

  it('reads the requested cookie from a multi-cookie header', () => {
    const header = 'theme=dark; yt-convert-consent=declined; session=abc';
    expect(parseCookieHeader(header, CONSENT_COOKIE)).toBe('declined');
    expect(parseCookieHeader(header, 'theme')).toBe('dark');
    expect(parseCookieHeader(header, 'missing')).toBeNull();
  });

  it('tolerates whitespace and empty values', () => {
    expect(parseCookieHeader(' a = 1 ; b= ; c=3 ', 'a')).toBe('1');
    expect(parseCookieHeader('a=1; b=; c=3', 'b')).toBeNull();
  });
});

describe('readCookie / getConsentChoice', () => {
  it('returns null outside a browser', () => {
    vi.stubGlobal('document', undefined);
    expect(readCookie(CONSENT_COOKIE)).toBeNull();
    expect(getConsentChoice()).toBeNull();
  });

  it('returns null when no consent cookie is present', () => {
    vi.stubGlobal('document', { cookie: 'theme=dark; other=1' });
    expect(getConsentChoice()).toBeNull();
  });

  it('returns null for a malformed consent value', () => {
    vi.stubGlobal('document', { cookie: `${CONSENT_COOKIE}=maybe` });
    expect(getConsentChoice()).toBeNull();
  });

  it('reads a stored choice', () => {
    vi.stubGlobal('document', { cookie: `other=1; ${CONSENT_COOKIE}=accepted` });
    expect(getConsentChoice()).toBe('accepted');
  });
});

describe('setConsentChoice', () => {
  it('no-ops outside a browser', () => {
    vi.stubGlobal('document', undefined);
    expect(() => setConsentChoice('accepted')).not.toThrow();
  });

  it('writes the consent cookie with a one-year max-age, path and SameSite', () => {
    let stored = '';
    const doc: { cookie: string } = { cookie: '' };
    Object.defineProperty(doc, 'cookie', {
      get: () => stored,
      set: (value: string) => {
        stored = value;
      },
      configurable: true,
    });
    vi.stubGlobal('document', doc);

    setConsentChoice('declined');
    expect(stored).toContain(`${CONSENT_COOKIE}=declined`);
    expect(stored).toContain(`max-age=${CONSENT_MAX_AGE_SECONDS}`);
    expect(stored).toContain('path=/');
    expect(stored).toContain('SameSite=Lax');
    // Round-trips back through the reader.
    expect(getConsentChoice()).toBe('declined');
  });
});
