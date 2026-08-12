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
  // Piped tertiary fallback — each instance serves streams from its own
  // proxy host. The well-known public proxies are listed by default; an
  // operator can approve additional self-hosted proxies via PIPED_PROXY_HOSTS
  // (comma-separated suffixes, e.g. "pipedproxy.example.com").
  // Kept in step with PIPED_INSTANCES in ./piped.ts (refreshed 2026-08-12):
  // suffixes for instances that stopped serving Piped were removed.
  'kavin.rocks',
  'private.coffee',
  'reallyaweso.me',
] as const;

/**
 * Parse the optional PIPED_PROXY_HOSTS allowlist. Each entry is a host suffix
 * matched like the built-in list (exact host or any sub-host). Entries are
 * sanitised so an operator cannot accidentally widen the allowlist to a
 * bare TLD or inject a wildcard.
 */
function extraPipedSuffixes(): string[] {
  const raw = process.env.PIPED_PROXY_HOSTS || '';
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const host = part.trim().toLowerCase().replace(/^\.+|\.+$/g, '');
    // Require at least one dot and a 2+ char TLD; reject obvious junk.
    if (!host || host.includes('/') || host.includes('*') || !/\.[a-z]{2,}$/.test(host)) continue;
    out.push(host);
  }
  return out;
}

function isAllowedHost(host: string): boolean {
  const h = host.toLowerCase();
  if (ALLOWED_SUFFIXES.some(suffix => h === suffix || h.endsWith(`.${suffix}`))) return true;
  return extraPipedSuffixes().some(suffix => h === suffix || h.endsWith(`.${suffix}`));
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
