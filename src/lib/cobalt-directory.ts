/**
 * Discovery of PUBLIC cobalt instances that are currently passing
 * cobalt.directory's YouTube test.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TRUST MODEL — read this before adding a host.
 * ─────────────────────────────────────────────────────────────────────────
 * cobalt.directory is a HEALTH SIGNAL, not a trust source. Anybody can list
 * an instance there, so a directory entry alone must never be enough to make
 * this server send a URL to a host, nor to make /api/convert stream bytes
 * from it.
 *
 * We therefore intersect the directory's answer with REVIEWED_COBALT_APIS,
 * a hand-maintained exact-host allowlist committed to this repo. The
 * directory can only ever *narrow* that list (by reporting a reviewed host as
 * failing YouTube); it can never widen it.
 *
 * Because the allowlist is a compile-time constant, every serverless
 * instance of this app agrees on it without sharing memory. That is what
 * makes cross-process authorization work: a conversion ticket issued by
 * /api/video-info on instance A stays valid on instance B serving
 * /api/convert, since B derives the same set of proxiable cobalt hosts from
 * source rather than from A's in-memory discovery cache. See
 * ./media-hosts.ts (reviewedCobaltApiHosts) for the consumer.
 *
 * Excluded on purpose:
 *   - *.imput.net (sunny/kityune/nachos/blossom) and api.cobalt.tools. These
 *     are the official instances; the cobalt API docs state hosted instances
 *     "are not intended to be used in other projects without explicit
 *     permission". We honour that.
 *   - Any host the directory reports that is not in the reviewed list.
 */

export const COBALT_DIRECTORY_URL = 'https://cobalt.directory/api/working?type=api';

/** Bound the directory lookup so a slow/hung directory cannot stall a convert. */
export const COBALT_DIRECTORY_TIMEOUT_MS = 5_000;

/** Directory answers are cached process-locally for this long. */
export const COBALT_DIRECTORY_TTL_MS = 5 * 60 * 1000;

/** Never fan out to more than this many public instances for one request. */
export const COBALT_MAX_PUBLIC_ATTEMPTS = 3;

/**
 * Hand-reviewed public cobalt API hosts. EXACT hostnames only — never
 * parent-domain suffixes, so an unrelated service on the same registrable
 * domain cannot be proxied.
 *
 * Review rules: every host was listed under cobalt.directory's
 * `data.youtube` on the review date (the directory's own live YouTube test),
 * serves cobalt v11.7.x from a public codebase, and belongs to an operator
 * NOT already represented here — one independent operator per host, no
 * padding. Adding a host is a deliberate, reviewable act.
 *
 * Reviewed 2026-09-01: added api.cobalt.rpkiinval.id, cobaltapi.squair.xyz
 * and cobalt-omega.wolfy.love (all YouTube ✅ that day). Checked and
 * deliberately left out the same day: api.qwkuns.me and cobaltapi.cjs.nz
 * (both `error.api.youtube.login`), and melon/grapefruit.clxxped.lol (same
 * operator as the already-reviewed lime.clxxped.lol).
 */
export const REVIEWED_COBALT_APIS = [
  'kitty.tame.gg',
  'api-cobalt.eversiege.network',
  'lime.clxxped.lol',
  'apicobalt.mgytr.top',
  'cobalt-api.lamps-dev.dev',
  'nuko-c.meowing.de',
  'bergung-api.hoffnungfuerdiezukunft.net',
  'api.cobalt.rpkiinval.id',
  'cobaltapi.squair.xyz',
  'cobalt-omega.wolfy.love',
] as const;

const REVIEWED_SET: ReadonlySet<string> = new Set<string>(REVIEWED_COBALT_APIS);

/** True when `host` is on the reviewed exact-host allowlist. */
export function isReviewedCobaltHost(host: string): boolean {
  return REVIEWED_SET.has(host.trim().toLowerCase().replace(/\.$/, ''));
}

/**
 * Strictly validate one directory entry and reduce it to an origin.
 *
 * Rejects, in order: non-strings, over-long values, unparseable URLs, any
 * scheme other than https, embedded credentials, explicit ports, IP literals
 * and localhost, and any entry carrying a path, query string, or fragment.
 * A directory entry is only ever allowed to name a bare HTTPS origin.
 *
 * Returns the normalised origin (e.g. `https://kitty.tame.gg`) or null.
 */
export function normalizeDirectoryEntry(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value || value.length > 256) return null;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  // HTTPS only — a plaintext hop would let a network attacker swap the API.
  if (parsed.protocol !== 'https:') return null;
  // Credentials in a URL are never legitimate here.
  if (parsed.username || parsed.password) return null;
  // Non-default ports are not expected from the directory and could point at
  // an internal service reached through a hijacked DNS name.
  if (parsed.port) return null;
  // A directory entry must be a bare origin: no path, query, or fragment.
  if ((parsed.pathname && parsed.pathname !== '/') || parsed.search || parsed.hash) return null;

  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (!host) return null;
  // Defence in depth: IP literals / loopback names can never be reviewed
  // hosts, but reject them explicitly so the intent is unmistakable.
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return null;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return null;
  if (host.includes(':')) return null;

  // The decisive check: reviewed hosts only. An unreviewed host the directory
  // reports as healthy is still refused.
  if (!isReviewedCobaltHost(host)) return null;

  return `https://${host}`;
}

/**
 * Parse the directory payload, keeping ONLY the APIs listed under
 * `data.youtube`. Entries under any other service key are ignored: an
 * instance that can fetch TikTok tells us nothing about YouTube, which is the
 * only reason we are here.
 */
export function parseDirectoryPayload(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const data = (payload as Record<string, unknown>).data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  const youtube = (data as Record<string, unknown>).youtube;
  if (!Array.isArray(youtube)) return [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of youtube) {
    const origin = normalizeDirectoryEntry(entry);
    if (!origin || seen.has(origin)) continue;
    seen.add(origin);
    out.push(origin);
  }
  return out;
}

interface DirectoryCache {
  at: number;
  origins: string[];
}

const globalForDirectory = globalThis as typeof globalThis & {
  __ytConvertCobaltDirectory?: DirectoryCache;
  __ytConvertCobaltDirectoryInflight?: Promise<string[]>;
};

/** Test seam: drop the cached directory answer. */
export function resetCobaltDirectoryCache(): void {
  delete globalForDirectory.__ytConvertCobaltDirectory;
  delete globalForDirectory.__ytConvertCobaltDirectoryInflight;
}

/** True unless the operator opted out with COBALT_PUBLIC_DISCOVERY=0. */
export function isPublicDiscoveryEnabled(): boolean {
  const raw = (process.env.COBALT_PUBLIC_DISCOVERY || '').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off' && raw !== 'no';
}

/**
 * Fetch (or reuse a cached) list of reviewed public cobalt origins that the
 * directory currently reports as passing its YouTube test.
 *
 * Failure is never fatal: on timeout, HTTP error, or malformed payload we
 * return an empty list and let the caller surface the real reason the
 * conversion failed.
 */
export async function discoverPublicCobaltApis(now = Date.now()): Promise<string[]> {
  if (!isPublicDiscoveryEnabled()) return [];

  const cached = globalForDirectory.__ytConvertCobaltDirectory;
  if (cached && now - cached.at < COBALT_DIRECTORY_TTL_MS) return cached.origins;

  // Coalesce concurrent lookups so a burst of requests makes one call.
  if (globalForDirectory.__ytConvertCobaltDirectoryInflight) {
    return globalForDirectory.__ytConvertCobaltDirectoryInflight;
  }

  const inflight = (async (): Promise<string[]> => {
    try {
      const response = await fetch(COBALT_DIRECTORY_URL, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(COBALT_DIRECTORY_TIMEOUT_MS),
      });
      if (!response.ok) return [];
      const payload = (await response.json().catch(() => null)) as unknown;
      const origins = parseDirectoryPayload(payload);
      globalForDirectory.__ytConvertCobaltDirectory = { at: now, origins };
      return origins;
    } catch {
      // Cache the empty answer briefly too, so a directory outage doesn't add
      // a 5 s penalty to every single conversion.
      globalForDirectory.__ytConvertCobaltDirectory = { at: now, origins: [] };
      return [];
    } finally {
      delete globalForDirectory.__ytConvertCobaltDirectoryInflight;
    }
  })();

  globalForDirectory.__ytConvertCobaltDirectoryInflight = inflight;
  return inflight;
}
