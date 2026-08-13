/**
 * SSRF-safe media URL checks. The convert proxy may only fetch allowlisted
 * HTTPS media CDNs. Redirect hops must be re-checked with the same rules.
 *
 * This module is client-safe: it must not import undici or youtube-egress.
 * Server fetch + redirect following lives in ./media-fetch.
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
  // Public 9Convert/dlsrv farm. These are the only farm-owned hosts we proxy;
  // a dlink on any other hostname is rejected before /api/convert fetches it.
  'dlsrv.online',
  '9convert.org',
  '9convert.com',
  // Piped mirror fallback — each instance serves streams from its own proxy
  // host. Keep these suffixes in step with PIPED_INSTANCES in ./piped.ts.
  'kavin.rocks',
  'private.coffee',
  'reallyaweso.me',
  'nosebs.ru',
  'privacy.com.de',
  'owo.si',
  'codespace.cz',
  'darkness.services',
  'orangenet.cc',
  // Cobalt last-resort fallback — tunnel/redirect URLs are served from the
  // instance's own host. The official instance is allowlisted by default;
  // self-hosted instances (the only ones that actually work for YouTube) are
  // approved by the operator via COBALT_PROXY_HOSTS.
  'cobalt.tools',
] as const;

// Invidious /latest_version with local=true keeps googlevideo retrieval on
// the mirror's IP. These are exact API hosts rather than broad parent-domain
// suffixes, so unrelated services on the same domains are not proxiable.
const ALLOWED_EXACT_HOSTS = [
  'invidious.tiekoetter.com',
  'invidious.f5.si',
  'yt.chocolatemoo53.com',
  'inv.nadeko.net',
  'invidious.nerdvpn.de',
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
  if (ALLOWED_EXACT_HOSTS.some(allowed => h === allowed)) return true;
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
