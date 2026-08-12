/**
 * SSRF-safe media URL checks. The convert proxy may only fetch allowlisted
 * HTTPS media CDNs. Redirect hops must be re-checked with the same rules.
 */

const ALLOWED_SUFFIXES = [
  'googlevideo.com',
  'sndcdn.com',
  'soundcloud.com',
  'tiktokcdn.com',
  'tiktokcdn-us.com',
  'tiktokcdn-eu.com',
  'tiktok.com',
  'byteoversea.com',
  'ibytedtos.com',
  'muscdn.com',
  'twimg.com',
  'cdninstagram.com',
  'fbcdn.net',
] as const;

function isAllowedHost(host: string): boolean {
  const h = host.toLowerCase();
  return ALLOWED_SUFFIXES.some(suffix => h === suffix || h.endsWith(`.${suffix}`));
}

function isIpLiteral(host: string): boolean {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return true;
  if (host.includes(':')) return true; // IPv6 or IPv4-mapped
  return false;
}

function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (h === '0.0.0.0' || h === '::1' || h === '[::1]') return true;
  if (isIpLiteral(h)) return true;
  return false;
}

export function isAllowedMediaUrl(raw: string): boolean {
  if (!raw || raw.length > 4096) return false;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;
  const host = parsed.hostname.toLowerCase();
  if (!host || isBlockedHost(host)) return false;
  return isAllowedHost(host);
}

const MAX_REDIRECTS = 4;
const FETCH_TIMEOUT_MS = 20_000;

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

  const response = await fetch(url, {
    ...init,
    headers,
    redirect: 'manual',
    signal: init.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    if (!location) throw new MediaHostError('Redirect without Location');
    const next = new URL(location, url).toString();
    return fetchAllowedMedia(next, init, hop + 1);
  }

  return response;
}
