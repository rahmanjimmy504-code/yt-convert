/**
 * Cross-process authorization regression tests.
 *
 * THE BUG THIS GUARDS AGAINST
 * ---------------------------
 * /api/video-info and /api/convert are separate requests and, on a
 * serverless platform, are routinely served by DIFFERENT instances. If the
 * set of proxiable cobalt hosts were derived from in-memory discovery state
 * — "instance A just learned kitty.tame.gg is healthy, so it may be
 * proxied" — then a ticket minted by A would be refused by B, which never
 * ran discovery. The user would see an intermittent, unreproducible
 * "Refusing to fetch a non-allowlisted host".
 *
 * The fix is structural: media-host trust comes ONLY from compile-time
 * constants (REVIEWED_COBALT_APIS) and environment variables, both of which
 * are identical on every instance. Discovery may narrow which host we ask,
 * never which host we are willing to stream from.
 *
 * These tests simulate the process boundary by clearing the discovery cache
 * (and any module-level state) between the "issue" and "redeem" halves, and
 * by checking authorization with discovery switched fully off.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cobaltFormats } from './cobalt';
import {
  discoverPublicCobaltApis,
  resetCobaltDirectoryCache,
  REVIEWED_COBALT_APIS,
} from './cobalt-directory';
import { isAllowedMediaUrl } from './media-hosts';
import { issueConvertTicket, verifyConvertTicket } from './convert-ticket';

const SAVED_ENV = { ...process.env };
const PAGE = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
const A = REVIEWED_COBALT_APIS[0];

beforeEach(() => {
  delete process.env.COBALT_API_URL;
  delete process.env.COBALT_API_AUTH;
  delete process.env.COBALT_PROXY_HOSTS;
  delete process.env.COBALT_PUBLIC_DISCOVERY;
  process.env.CONVERT_TICKET_SECRET = 'shared-secret-across-instances';
  resetCobaltDirectoryCache();
});

afterEach(() => {
  process.env = { ...SAVED_ENV };
  vi.unstubAllGlobals();
  resetCobaltDirectoryCache();
});

function stubDirectoryAnd(host: string, tunnelUrl: string) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.startsWith('https://cobalt.directory/')) {
      return new Response(JSON.stringify({ data: { youtube: [`https://${host}`] } }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ status: 'tunnel', url: tunnelUrl }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }));
}

describe('a cobalt tunnel URL survives the /api/video-info -> /api/convert boundary', () => {
  it('stays authorized on an instance that never ran discovery', async () => {
    const tunnel = `https://${A}/tunnel?id=abc&exp=999`;

    // ---- Instance A: lookup. Runs discovery, gets a tunnel, mints a ticket.
    stubDirectoryAnd(A, tunnel);
    const discovered = await discoverPublicCobaltApis();
    expect(discovered).toEqual([`https://${A}`]);
    const result = await cobaltFormats(PAGE, 'video');
    expect(result.formats[0].url).toBe(tunnel);
    expect(isAllowedMediaUrl(tunnel)).toBe(true);
    const ticket = issueConvertTicket(PAGE, '203.0.113.7');

    // ---- Process boundary: a cold instance, no discovery cache, no network.
    resetCobaltDirectoryCache();
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('instance B must not need the network to authorize a host');
    }));

    // ---- Instance B: convert. Must reach the same verdict from source alone.
    expect(verifyConvertTicket(ticket, PAGE, '203.0.113.7').ok).toBe(true);
    expect(isAllowedMediaUrl(tunnel)).toBe(true);
  });

  it('stays authorized even when the cold instance has discovery disabled', () => {
    // An operator could flip COBALT_PUBLIC_DISCOVERY=0 between deploys, or
    // set it on only some instances. Authorization must not depend on it:
    // discovery decides who we ASK, the allowlist decides who we TRUST.
    process.env.COBALT_PUBLIC_DISCOVERY = '0';
    expect(isAllowedMediaUrl(`https://${A}/tunnel?id=abc`)).toBe(true);
  });

  it('agrees on the verdict for every reviewed host without any network access', () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('authorization must be a pure function of source + env');
    }));
    for (const host of REVIEWED_COBALT_APIS) {
      expect(isAllowedMediaUrl(`https://${host}/tunnel?id=1`)).toBe(true);
    }
  });

  it('authorizes a private instance tunnel from COBALT_API_URL alone', () => {
    // Same property for the private path: the convert instance only has the
    // env var, not the lookup instance's memory.
    process.env.COBALT_API_URL = 'https://cobalt.private.example';
    expect(isAllowedMediaUrl('https://cobalt.private.example/tunnel?id=1')).toBe(true);
    delete process.env.COBALT_API_URL;
    expect(isAllowedMediaUrl('https://cobalt.private.example/tunnel?id=1')).toBe(false);
  });

  it('does NOT authorize a host merely because discovery returned it', async () => {
    // The inverse property, and the reason this is safe: even after a
    // successful discovery round, an unreviewed host stays unproxiable.
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.startsWith('https://cobalt.directory/')) {
        return new Response(
          JSON.stringify({ data: { youtube: ['https://attacker.example', `https://${A}`] } }),
          { headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 404 });
    }));
    await discoverPublicCobaltApis();
    expect(isAllowedMediaUrl('https://attacker.example/tunnel?id=1')).toBe(false);
  });

  it('keeps the ticket bound to the page URL and client IP', () => {
    const ticket = issueConvertTicket(PAGE, '203.0.113.7');
    expect(verifyConvertTicket(ticket, PAGE, '203.0.113.8').ok).toBe(false);
    expect(verifyConvertTicket(ticket, 'https://youtu.be/other', '203.0.113.7').ok).toBe(false);
    expect(verifyConvertTicket(`${ticket}x`, PAGE, '203.0.113.7').ok).toBe(false);
  });

  it('a ticket does not launder an unauthorized media host', () => {
    // Defence in depth: the ticket authorizes the *page*, and the allowlist
    // independently authorizes the *media host*. Holding a valid ticket must
    // not make an arbitrary cobalt-supplied URL fetchable.
    const ticket = issueConvertTicket(PAGE, '203.0.113.7');
    expect(verifyConvertTicket(ticket, PAGE, '203.0.113.7').ok).toBe(true);
    expect(isAllowedMediaUrl('https://attacker.example/tunnel?id=1')).toBe(false);
    expect(isAllowedMediaUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
  });
});
