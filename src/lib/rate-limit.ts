import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

/**
 * Fixed-window rate limiter with an optional Upstash Redis REST backend.
 *
 * When both Upstash variables are configured, counters are shared by every
 * serverless instance. Otherwise a bounded per-instance Map keeps local dev,
 * CI, and self-hosted installs dependency-free. The Redis path always fails
 * open: a slow or unavailable abuse guard must not take the site down.
 *
 * Returns the number of seconds to wait when limited, else 0.
 */

const WINDOW_MS = 60_000;
const WINDOW_SECONDS = WINDOW_MS / 1000;
const MAX_KEYS = 5000;
const SHARED_TIMEOUT_MS = 500;
const REDIS_KEY_PREFIX = 'yt-convert:rate-limit:v1:';

const hits = new Map<string, { count: number; start: number }>();

// Keep the increment and first-hit expiry atomic. INCR selects exactly one
// first request even under concurrency; no read-modify-write race is possible.
const FIXED_WINDOW_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return {count, redis.call("TTL", KEYS[1])}
`.trim();

interface SharedConfig {
  url: string;
  token: string;
}

interface UpstashResponse {
  result?: unknown;
  error?: string;
}

function sharedConfig(): SharedConfig | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim().replace(/\/+$/, '');
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  return url && token ? { url, token } : null;
}

function memoryRateLimit(key: string, maxPerWindow: number): number {
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || now - entry.start >= WINDOW_MS) {
    hits.set(key, { count: 1, start: now });
    if (hits.size > MAX_KEYS) {
      for (const [storedKey, value] of hits) {
        if (now - value.start >= WINDOW_MS) hits.delete(storedKey);
      }
    }
    return 0;
  }

  entry.count += 1;
  if (entry.count > maxPerWindow) {
    return Math.ceil((entry.start + WINDOW_MS - now) / 1000);
  }
  return 0;
}

function redisKey(key: string): string {
  // Per-IP limiting needs a stable key, but the raw IP does not need to be
  // visible in Redis or its access logs.
  const digest = createHash('sha256').update(key).digest('hex');
  return `${REDIS_KEY_PREFIX}${digest}`;
}

async function sharedRateLimit(config: SharedConfig, key: string, maxPerWindow: number): Promise<number> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SHARED_TIMEOUT_MS);

  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        'EVAL',
        FIXED_WINDOW_SCRIPT,
        '1',
        redisKey(key),
        String(WINDOW_SECONDS),
      ]),
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) return 0;

    const payload = (await response.json()) as UpstashResponse;
    if (payload.error || !Array.isArray(payload.result) || payload.result.length < 2) return 0;

    const count = Number(payload.result[0]);
    const ttl = Number(payload.result[1]);
    if (!Number.isFinite(count) || !Number.isFinite(ttl)) return 0;
    if (count <= maxPerWindow) return 0;

    // A missing/expired TTL is an unhealthy store result, so fail open rather
    // than accidentally returning an unbounded or misleading retry interval.
    return ttl > 0 ? Math.ceil(ttl) : 0;
  } catch {
    return 0;
  } finally {
    clearTimeout(timeout);
  }
}

export async function rateLimit(key: string, maxPerWindow: number): Promise<number> {
  const config = sharedConfig();
  return config
    ? sharedRateLimit(config, key, maxPerWindow)
    : memoryRateLimit(key, maxPerWindow);
}

type TrustedIpHeader = 'cf-connecting-ip' | 'x-forwarded-for' | 'x-real-ip';

function validIp(value: string | null): string {
  const candidate = (value || '').trim();
  // Forwarded values become in-memory rate-limit keys. Reject malformed or
  // oversized input rather than letting an attacker manufacture arbitrary
  // keys (and never accept an address with a client-supplied port suffix).
  return candidate.length <= 64 && isIP(candidate) !== 0 ? candidate : '';
}

function forwardedIp(value: string | null): string {
  const raw = value || '';
  if (!raw || raw.length > 512) return '';
  // For an append-style proxy the rightmost value is the hop the trusted
  // ingress actually observed; leftmost entries can be supplied by a client.
  // Our bundled Caddy config overwrites XFF, and Vercel also overwrites it, so
  // those deployments normally contain exactly one value.
  const values = raw.split(',');
  return validIp(values[values.length - 1]);
}

function configuredTrustedHeader(): TrustedIpHeader | null {
  const configured = (process.env.TRUSTED_PROXY_IP_HEADER || '').trim().toLowerCase();
  return configured === 'cf-connecting-ip' || configured === 'x-forwarded-for' || configured === 'x-real-ip'
    ? configured
    : null;
}

/**
 * Read the address supplied by the deployment's trusted ingress proxy.
 *
 * Render is fronted by Cloudflare, whose CF-Connecting-IP is a single value
 * derived from the edge connection; unlike X-Forwarded-For, a visitor cannot
 * inject a fake leftmost value. Vercel documents that it overwrites XFF to
 * prevent spoofing. Other deployments must opt into one header explicitly
 * and configure their ingress to overwrite it (the provided Caddy/Termux
 * configurations do this). With no known trust boundary we deliberately use
 * "unknown" instead of trusting an arbitrary request header.
 */
export function clientIp(request: Request): string {
  let header: TrustedIpHeader | null = null;
  if (process.env.RENDER === 'true') header = 'cf-connecting-ip';
  else if (process.env.VERCEL === '1') header = 'x-forwarded-for';
  else header = configuredTrustedHeader();

  if (!header) return 'unknown';
  const ip = header === 'x-forwarded-for'
    ? forwardedIp(request.headers.get(header))
    : validIp(request.headers.get(header));
  return ip || 'unknown';
}
