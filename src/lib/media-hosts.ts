/**
 * SSRF-safe media URL checks. The convert proxy may only fetch allowlisted
 * HTTPS media CDNs. Redirect hops must be re-checked with the same rules.
 *
 * This module is client-safe: it must not import undici or youtube-egress.
 * Server fetch + redirect following lives in ./media-fetch.
 *
 * ── Cross-process note ───────────────────────────────────────────────────
 * Every rule here is derived from compile-time constants or environment
 * variables, never from in-memory discovery state. That is deliberate: a
 * conversion ticket minted by /api/video-info on one serverless instance
 * must still authorize the exact same media host when a *different*
 * instance serves /api/convert. Anything cached in a module-level variable
 * would make authorization depend on which process answered, so cobalt host
 * trust comes from the reviewed allowlist in ./cobalt-directory.ts (a
 * committed constant) rather than from a live directory response.
 */

import { REVIEWED_COBALT_APIS } from './cobalt-directory';

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
  // AHM7xMakki AllDL fallback CDN (./alldl.ts). The API hands back links on
  // c.ymcdn.org, but live traffic (verified 2026-09-01) 30x-redirects them to
  // rotating dlNN.ymcdn.org hosts, so the whole operator domain is allowlisted
  // as a suffix — the same convention as the 9Convert farm above. An exact
  // c.ymcdn.org entry alone would refuse every download at the first hop.
  'ymcdn.org',
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
] as const;

// Invidious /latest_version with local=true keeps googlevideo retrieval on
// the mirror's IP. These are exact API hosts rather than broad parent-domain
// suffixes, so unrelated services on the same domains are not proxiable.
const ALLOWED_EXACT_HOSTS = [
  'invidious.tiekoetter.com',
  'invidious.f5.si',
  'yt.chocolatemoo53.com',
  'invidious.nerdvpn.de',
  // AHM7xMakki AllDL API host (./alldl.ts) — exact only. Its CDN family
  // (ymcdn.org, including the rotating dlNN. redirect targets) is allowlisted
  // as a suffix above.
  'ahm7xmakki.com',
  // Reviewed public cobalt APIs. A cobalt `tunnel` URL is always served from
  // the API's own origin (GET /tunnel), so allowing the exact API host is
  // enough — and, being exact, it cannot be widened by a subdomain the
  // directory happens to report.
  ...REVIEWED_COBALT_APIS,
] as const;

/**
 * The exact host of the operator's own cobalt instance, taken from
 * COBALT_API_URL. Cobalt serves its tunnels from the same origin as the API,
 * so configuring the API implicitly authorises same-host tunnel media —
 * without this, a correctly configured private instance would return a
 * perfectly good tunnel URL that /api/convert then refused to fetch.
 *
 * Only an exact HTTPS host qualifies. A plaintext or malformed COBALT_API_URL
 * grants nothing, and a private instance whose MEDIA is served from a
 * *different* hostname still needs COBALT_PROXY_HOSTS.
 */
function configuredCobaltHost(): string | null {
  const raw = (process.env.COBALT_API_URL || '').trim();
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || isBlockedHost(host)) return null;
  return host;
}

/**
 * Parse a comma-separated host list from an environment variable. Entries
 * are sanitised so an operator cannot accidentally widen the allowlist to a
 * bare TLD or inject a wildcard. Whether an entry then matches EXACTLY or
 * as a parent-domain suffix is decided by the caller, not here.
 */
function parseHostListEnv(raw: string): string[] {
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
  return parseHostListEnv(process.env.PIPED_PROXY_HOSTS || '');
}

/**
 * Parse the optional COBALT_PROXY_HOSTS allowlist — the tunnel hosts of a
 * self-hosted cobalt instance, which is the only kind that serves YouTube.
 */
function extraCobaltSuffixes(): string[] {
  return parseHostListEnv(process.env.COBALT_PROXY_HOSTS || '');
}

/**
 * Parse the optional APIFY_PROXY_HOSTS allowlist. Unlike the Piped/Cobalt
 * lists these entries match EXACTLY — no sub-host, no suffix: the Apify
 * fallback hands back one specific file host, and "files.example.com" must
 * never authorise "x.files.example.com" or "files.example.com.evil.example".
 * It is only needed when an Actor serves its output from a host other than
 * api.apify.com (which is trusted while APIFY_TOKEN is set, see below).
 */
function extraApifyExactHosts(): string[] {
  return parseHostListEnv(process.env.APIFY_PROXY_HOSTS || '');
}

function isAllowedHost(host: string): boolean {
  const h = host.toLowerCase();
  if (ALLOWED_EXACT_HOSTS.some(allowed => h === allowed)) return true;
  if (h === configuredCobaltHost()) return true;
  // The paid Apify Actor fallback serves its finished files from the API's
  // own host. Gated on APIFY_TOKEN so deployments that never opt in keep
  // the smallest possible proxiable surface — and exact-host only, so no
  // subdomain of api.apify.com becomes proxiable by implication.
  if (h === 'api.apify.com' && (process.env.APIFY_TOKEN || '').trim()) return true;
  if (extraApifyExactHosts().some(allowed => h === allowed)) return true;
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
