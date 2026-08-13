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

/** Fetch a media URL, following redirects only onto allowlisted hosts. */
export async function fetchAllowedMedia(url: string, init: RequestInit = {}, hop = 0): Promise<Response> {
  if (hop > MAX_REDIRECTS) throw new MediaHostError('Too many redirects');
  if (!isAllowedMediaUrl(url)) throw new MediaHostError('Refusing to fetch a non-allowlisted host');

  const headers = new Headers(init.headers);
  if (!headers.has('User-Agent')) {
    headers.set('User-Agent', 'Mozilla/5.0 (compatible; YTConvert/1.0)');
  }
  // 9Convert's browser flow opens the dlink from its result page. Preserve a
  // same-site Referer for farm-owned file endpoints that enforce that normal
  // hotlink check; never forward the user's original page or credentials.
  if (!headers.has('Referer')) {
    const host = new URL(url).hostname.toLowerCase();
    if (host === 'dlsrv.online' || host.endsWith('.dlsrv.online')) {
      headers.set('Referer', 'https://embed.dlsrv.online/');
    } else if (host === '9convert.org' || host.endsWith('.9convert.org')) {
      headers.set('Referer', 'https://9convert.org/');
    } else if (host === '9convert.com' || host.endsWith('.9convert.com')) {
      headers.set('Referer', 'https://9convert.com/');
    }
  }

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
    const next = new URL(location, url).toString();
    return fetchAllowedMedia(next, init, hop + 1);
  }

  return response;
}
