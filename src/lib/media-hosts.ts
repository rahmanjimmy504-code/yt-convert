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
  // Cobalt last-resort fallback — tunnel/redirect URLs are served from the
  // instance's own host. The official instance is allowlisted by default;
  // self-hosted instances (the only ones that actually work for YouTube) are
  // approved by the operator via COBALT_PROXY_HOSTS.
  'cobalt.tools',
] as const;

/**
 * Parse a comma-separated host-suffix allowlist from an environment variable.
 * Entries are sanitised so an operator cannot accidentally widen the
 * allowlist to a bare TLD or inject a wildcard.
 */
function parseSuffixEnv(raw: string): string[] {
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

/**
 * Parse the optional PIPED_PROXY_HOSTS allowlist. Each entry is a host suffix
 * matched like the built-in list (exact host or any sub-host). Entries are
 * sanitised so an operator cannot accidentally widen the allowlist to a
 * bare TLD or inject a wildcard.
 */
function extraPipedSuffixes(): string[] {
  return parseSuffixEnv(process.env.PIPED_PROXY_HOSTS || '');
}

/**
 * Parse the optional COBALT_PROXY_HOSTS allowlist — the tunnel hosts of a
 * self-hosted cobalt instance, which is the only kind that serves YouTube.
 */
function extraCobaltSuffixes(): string[] {
  return parseSuffixEnv(process.env.COBALT_PROXY_HOSTS || '');
}

function isAllowedHost(host: string): boolean {
  const h = host.toLowerCase();
  if (ALLOWED_SUFFIXES.some(suffix => h === suffix || h.endsWith(`.${suffix}`))) return true;
  const extras = [...extraPipedSuffixes(), ...extraCobaltSuffixes()];
  return extras.some(suffix => h === suffix || h.endsWith(`.${suffix}`));
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

  // Time out only the connection / headers phase. Once headers arrive we
  // clear the timer so a long progressive download is not aborted mid-stream.
  let response: Response;
  if (init.signal) {
    response = await fetch(url, {
      ...init,
      headers,
      redirect: 'manual',
      signal: init.signal,
    });
  } else {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);
    try {
      response = await fetch(url, {
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
