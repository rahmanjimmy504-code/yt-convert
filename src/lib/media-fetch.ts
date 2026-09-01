/**
 * Server-only media fetch. Lives apart from media-hosts.ts so the client
 * bundle can import isAllowedMediaUrl without pulling undici / node: URIs
 * through youtube-egress.
 */

import { isAllowedMediaUrl } from './media-hosts';
import { youtubeAwareFetch } from './youtube-egress';

const MAX_REDIRECTS = 4;
/** Only waits for upstream headers. Cleared before the body is streamed. */
const CONNECT_TIMEOUT_MS = 20_000;

export class MediaHostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaHostError';
  }
}

/**
 * Pick the correct Referer for a media URL. Farm-owned endpoints enforce a
 * same-site hotlink check: if the request carries a youtube.com Referer
 * (which /api/convert always sends as the "original page"), they serve a
 * CAPTCHA HTML page instead of bytes. We therefore OVERRIDE any supplied
 * Referer for those hosts, rather than only filling one in when absent.
 */
export function refererForMediaUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === 'dlsrv.online' || host.endsWith('.dlsrv.online')) {
      return 'https://embed.dlsrv.online/';
    }
    if (host === '9convert.org' || host.endsWith('.9convert.org')) {
      return 'https://9convert.org/';
    }
    if (host === '9convert.com' || host.endsWith('.9convert.com')) {
      return 'https://9convert.com/';
    }
    // The AllDL CDN (c.ymcdn.org and its rotating dlNN. redirect targets) is
    // fed by the ahm7xmakki.com API; keep the Referer same-site for it too.
    if (host === 'ymcdn.org' || host.endsWith('.ymcdn.org')) {
      return 'https://ahm7xmakki.com/';
    }
  } catch {
    return null;
  }
  return null;
}

function applyFarmHeaders(url: string, headers: Headers): void {
  const override = refererForMediaUrl(url);
  if (override) headers.set('Referer', override);
  if (!headers.has('User-Agent')) {
    headers.set('User-Agent', 'Mozilla/5.0 (compatible; YTConvert/1.0)');
  }
}

/** Fetch a media URL, following redirects only onto allowlisted hosts. */
export async function fetchAllowedMedia(url: string, init: RequestInit = {}, hop = 0): Promise<Response> {
  if (hop > MAX_REDIRECTS) throw new MediaHostError('Too many redirects');
  if (!isAllowedMediaUrl(url)) throw new MediaHostError('Refusing to fetch a non-allowlisted host');

  const headers = new Headers(init.headers);
  applyFarmHeaders(url, headers);

  // Time out only the connection / headers phase. Once headers arrive we
  // clear the timer so a long progressive download is not aborted mid-stream.
  let response: Response;
  if (init.signal) {
    response = await youtubeAwareFetch(url, {
      ...init,
      headers,
      redirect: 'manual',
      signal: init.signal,
    });
  } else {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);
    try {
      response = await youtubeAwareFetch(url, {
        ...init,
        headers,
        redirect: 'manual',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    if (!location) throw new MediaHostError('Redirect without Location');
    // Drain/ignore the body of the redirect response so undici doesn't
    // complain about an unconsumed stream.
    if (response.body) {
      try { await response.arrayBuffer(); } catch { /* ignore */ }
    }
    const next = new URL(location, url).toString();
    // Redirects get the same init (including any caller-supplied cookies),
    // but applyFarmHeaders will override Referer again for each new hop if
    // needed.
    return fetchAllowedMedia(next, init, hop + 1);
  }

  return response;
}
