import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAllowedMedia } from './media-fetch';
import { isAllowedMediaUrl } from './media-hosts';
import { REVIEWED_COBALT_APIS } from './cobalt-directory';

describe('isAllowedMediaUrl', () => {
  it('accepts allowlisted HTTPS media hosts', () => {
    expect(isAllowedMediaUrl('https://rr1---sn-abc.googlevideo.com/videoplayback?id=1')).toBe(true);
    expect(isAllowedMediaUrl('https://cf-media.sndcdn.com/track.mp3')).toBe(true);
    expect(isAllowedMediaUrl('https://video.twimg.com/ext_tw_video/1/pu/vid/720x720/a.mp4')).toBe(true);
    expect(isAllowedMediaUrl('https://v16-webapp-prime.tiktok.com/video/a')).toBe(true);
    expect(isAllowedMediaUrl('https://scontent.cdninstagram.com/v/t50.2886-16/a.mp4')).toBe(true);
    expect(isAllowedMediaUrl('https://scontent-iad3-1.xx.fbcdn.net/v/t42.123/a.mp4')).toBe(true);
  });

  it('rejects lookalike hosts and non-allowlisted sites', () => {
    expect(isAllowedMediaUrl('https://googlevideo.com.evil.example/x')).toBe(false);
    expect(isAllowedMediaUrl('https://evilgooglevideo.com/x')).toBe(false);
    expect(isAllowedMediaUrl('https://example.com/video.mp4')).toBe(false);
    expect(isAllowedMediaUrl('https://youtube.com/watch?v=1')).toBe(false);
    expect(isAllowedMediaUrl('https://facebook.com/watch/?v=1')).toBe(false);
  });

  it('allows the current public Piped proxy hosts (kept in step with piped.ts)', () => {
    expect(isAllowedMediaUrl('https://pipedproxy-bom.kavin.rocks/videoplayback?id=1')).toBe(true);
    expect(isAllowedMediaUrl('https://pipedproxy.api.piped.private.coffee/videoplayback?id=1')).toBe(true);
    expect(isAllowedMediaUrl('https://proxy.piped.private.coffee/videoplayback?id=1')).toBe(true);
    expect(isAllowedMediaUrl('https://pipedproxy.reallyaweso.me/videoplayback?id=1')).toBe(true);
    expect(isAllowedMediaUrl('https://pipedproxy.nosebs.ru/videoplayback?id=1')).toBe(true);
    expect(isAllowedMediaUrl('https://proxy.piped-api.codespace.cz/videoplayback?id=1')).toBe(true);
    expect(isAllowedMediaUrl('https://pipedproxy.orangenet.cc/videoplayback?id=1')).toBe(true);
  });

  it('allows only the public 9Convert farm suffixes and googlevideo dlinks', () => {
    expect(isAllowedMediaUrl('https://embed.dlsrv.online/file.mp4')).toBe(true);
    expect(isAllowedMediaUrl('https://cdn.9convert.org/file.mp3')).toBe(true);
    expect(isAllowedMediaUrl('https://s1.9convert.com/file.mp4')).toBe(true);
    expect(isAllowedMediaUrl('https://rr1---sn-test.googlevideo.com/videoplayback')).toBe(true);
    expect(isAllowedMediaUrl('https://dlsrv.online.evil.example/file')).toBe(false);
    expect(isAllowedMediaUrl('https://evil9convert.org/file')).toBe(false);
  });

  it('allows local Invidious latest_version streams only on configured mirror suffixes', () => {
    expect(isAllowedMediaUrl('https://invidious.tiekoetter.com/latest_version?id=x&itag=18&local=true')).toBe(true);
    expect(isAllowedMediaUrl('https://inv.nadeko.net/videoplayback?id=x')).toBe(true);
    expect(isAllowedMediaUrl('https://other.nadeko.net/videoplayback?id=x')).toBe(false);
    expect(isAllowedMediaUrl('https://random-invidious.example/latest_version?id=x')).toBe(false);
  });

  it('drops proxy suffixes for Piped instances that stopped serving (2026-08-12)', () => {
    // These instances no longer serve Piped, so their proxy hosts must not
    // be silently proxiable anymore (see PIPED_INSTANCES refresh).
    expect(isAllowedMediaUrl('https://pipedproxy.adminforge.de/videoplayback')).toBe(false);
    expect(isAllowedMediaUrl('https://pipedproxy.leptons.xyz/videoplayback')).toBe(false);
    expect(isAllowedMediaUrl('https://pipedproxy.drgns.space/videoplayback')).toBe(false);
    expect(isAllowedMediaUrl('https://pipedproxy.ducks.party/videoplayback')).toBe(false);
    expect(isAllowedMediaUrl('https://pipedproxy.piped.yt/videoplayback')).toBe(false);
  });

  it('rejects http, credentials, IP literals, and localhost (SSRF)', () => {
    expect(isAllowedMediaUrl('http://rr1.googlevideo.com/videoplayback')).toBe(false);
    expect(isAllowedMediaUrl('https://user:pass@rr1.googlevideo.com/x')).toBe(false);
    expect(isAllowedMediaUrl('https://127.0.0.1/secret')).toBe(false);
    expect(isAllowedMediaUrl('https://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isAllowedMediaUrl('https://192.168.1.10/file.mp4')).toBe(false);
    expect(isAllowedMediaUrl('https://10.0.0.5/file.mp4')).toBe(false);
    expect(isAllowedMediaUrl('https://[::1]/file.mp4')).toBe(false);
    expect(isAllowedMediaUrl('https://localhost/file.mp4')).toBe(false);
    expect(isAllowedMediaUrl('ftp://rr1.googlevideo.com/x')).toBe(false);
    expect(isAllowedMediaUrl('not a url')).toBe(false);
  });
});

describe('fetchAllowedMedia', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refuses a non-allowlisted URL before fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchAllowedMedia('https://127.0.0.1/secret')).rejects.toThrow(/non-allowlisted/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('follows a redirect only when the next hop is allowlisted', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        status: 302,
        headers: { get: (n: string) => (n === 'location' ? 'https://cf-media.sndcdn.com/a.mp3' : null) },
      })
      .mockResolvedValueOnce({
        status: 200,
        headers: { get: () => null },
        ok: true,
      });
    vi.stubGlobal('fetch', fetchMock);

    const res = await fetchAllowedMedia('https://api.soundcloud.com/tracks/1/stream');
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].redirect).toBe('manual');
  });

  it('overrides an existing (YouTube) Referer with the dlsrv same-site Referer', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: { get: () => null },
    });
    vi.stubGlobal('fetch', fetchMock);
    await fetchAllowedMedia('https://media.embed.dlsrv.online/file.mp4', {
      headers: { Referer: 'https://www.youtube.com/' },
    });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers as HeadersInit).get('referer')).toBe('https://embed.dlsrv.online/');
  });

  it('sends a same-site Referer for 9Convert farm dlinks when none was supplied', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: { get: () => null },
    });
    vi.stubGlobal('fetch', fetchMock);
    await fetchAllowedMedia('https://media.embed.dlsrv.online/file.mp4');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers as HeadersInit).get('referer')).toBe('https://embed.dlsrv.online/');
  });

  it('forwards a Range header and leaves the body stream to the caller', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 206,
      ok: false,
      headers: { get: (n: string) => (n === 'content-range' ? 'bytes 0-1/10' : null) },
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = await fetchAllowedMedia('https://rr1---sn-test.googlevideo.com/videoplayback?id=1', {
      headers: { Range: 'bytes=0-1' },
    });
    expect(res.status).toBe(206);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers as HeadersInit).get('range')).toBe('bytes=0-1');
  });

  it('refuses a redirect onto a private or unknown host', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 302,
      headers: { get: (n: string) => (n === 'location' ? 'https://169.254.169.254/latest/meta-data/' : null) },
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchAllowedMedia('https://cf-media.sndcdn.com/a.mp3')).rejects.toThrow(/non-allowlisted/);
  });
});

describe('cobalt fallback hosts', () => {
  const SAVED = { ...process.env };
  beforeEach(() => {
    delete process.env.COBALT_API_URL;
    delete process.env.COBALT_PROXY_HOSTS;
  });
  afterEach(() => {
    process.env = { ...SAVED };
  });

  it('no longer blanket-allows *.cobalt.tools', () => {
    // The official instances forbid third-party API use, so they are not
    // candidates and their hosts must not be proxiable. A suffix rule here
    // would also have allowed any subdomain anyone could point at cobalt.tools.
    expect(isAllowedMediaUrl('https://api.cobalt.tools/tunnel?id=1')).toBe(false);
    expect(isAllowedMediaUrl('https://cobalt.tools/tunnel?id=1')).toBe(false);
  });

  it('allows reviewed public cobalt API hosts as EXACT hosts only', () => {
    for (const host of REVIEWED_COBALT_APIS) {
      expect(isAllowedMediaUrl(`https://${host}/tunnel?id=1&exp=1`)).toBe(true);
      // Exact means exact: a subdomain of a reviewed host is not reviewed.
      expect(isAllowedMediaUrl(`https://evil.${host}/tunnel?id=1`)).toBe(false);
    }
  });

  it('rejects cobalt lookalikes', () => {
    expect(isAllowedMediaUrl('https://cobalt.tools.evil.example/x')).toBe(false);
    expect(isAllowedMediaUrl('https://evilcobalt.tools/x')).toBe(false);
    expect(isAllowedMediaUrl('https://kitty.tame.gg.evil.example/x')).toBe(false);
    expect(isAllowedMediaUrl('https://notkitty.tame.gg/x')).toBe(false);
  });

  it('trusts the exact host configured by COBALT_API_URL for same-host tunnels', () => {
    // Cobalt serves GET /tunnel from the same origin as the API, so a
    // configured private instance must be able to hand back its own media.
    expect(isAllowedMediaUrl('https://cobalt.private.example/tunnel?id=1')).toBe(false);
    process.env.COBALT_API_URL = 'https://cobalt.private.example';
    expect(isAllowedMediaUrl('https://cobalt.private.example/tunnel?id=1')).toBe(true);
    // Exact host only — a sibling hostname still needs COBALT_PROXY_HOSTS.
    expect(isAllowedMediaUrl('https://media.cobalt.private.example/tunnel?id=1')).toBe(false);
  });

  it('grants nothing for an unsafe COBALT_API_URL', () => {
    // Plaintext, credentials, IP literals and localhost never confer trust,
    // even though cobaltConfigFromEnv() would otherwise accept some of them.
    process.env.COBALT_API_URL = 'http://cobalt.private.example';
    expect(isAllowedMediaUrl('https://cobalt.private.example/tunnel')).toBe(false);
    process.env.COBALT_API_URL = 'https://user:pass@cobalt.private.example';
    expect(isAllowedMediaUrl('https://cobalt.private.example/tunnel')).toBe(false);
    process.env.COBALT_API_URL = 'https://127.0.0.1';
    expect(isAllowedMediaUrl('https://127.0.0.1/tunnel')).toBe(false);
    process.env.COBALT_API_URL = 'https://localhost';
    expect(isAllowedMediaUrl('https://localhost/tunnel')).toBe(false);
    process.env.COBALT_API_URL = 'not a url';
    expect(isAllowedMediaUrl('https://cobalt.private.example/tunnel')).toBe(false);
  });

  it('allows operator-approved self-hosted cobalt hosts via COBALT_PROXY_HOSTS', () => {
    expect(isAllowedMediaUrl('https://cobalt.example.com/tunnel?id=1')).toBe(false);
    process.env.COBALT_PROXY_HOSTS = 'cobalt.example.com';
    expect(isAllowedMediaUrl('https://cobalt.example.com/tunnel?id=1')).toBe(true);
    expect(isAllowedMediaUrl('https://tunnel.cobalt.example.com/x')).toBe(true);
  });

  it('sanitises junk COBALT_PROXY_HOSTS entries', () => {
    process.env.COBALT_PROXY_HOSTS = 'com, *, /evil, .example.org.';
    expect(isAllowedMediaUrl('https://anything.com/x')).toBe(false);
    expect(isAllowedMediaUrl('https://evil.example/x')).toBe(false);
    expect(isAllowedMediaUrl('https://a.example.org/x')).toBe(true);
  });
});
