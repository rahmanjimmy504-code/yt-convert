/**
 * Minimal in-memory fixed-window rate limiter keyed by client IP.
 *
 * Consistent with the other soft abuse guards in this project: per-instance
 * state, no persistence, good enough to stop casual hammering. Returns the
 * number of seconds to wait when limited, else 0.
 */

const WINDOW_MS = 60_000;
const MAX_KEYS = 5000;

const hits = new Map<string, { count: number; start: number }>();

export function rateLimit(ip: string, maxPerWindow: number): number {
  const now = Date.now();
  const entry = hits.get(ip);

  if (!entry || now - entry.start >= WINDOW_MS) {
    hits.set(ip, { count: 1, start: now });
    if (hits.size > MAX_KEYS) {
      for (const [key, value] of hits) {
        if (now - value.start >= WINDOW_MS) hits.delete(key);
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

export function clientIp(request: Request): string {
  return (
    (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}
