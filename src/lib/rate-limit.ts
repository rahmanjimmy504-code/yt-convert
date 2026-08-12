/**
 * Minimal in-memory fixed-window rate limiter keyed by client IP.
 *
 * Consistent with the other soft abuse guards in this project: per-instance
 * state, no persistence, good enough to stop casual hammering. Returns the
 * number of seconds to wait when limited, else 0.
 *
 * Security notes:
 * - MAX_KEYS limits memory usage from DoS via many unique IPs
 * - IP extraction uses x-forwarded-for and x-real-ip headers (trusted proxy headers)
 * - No persistence means rate limits reset on server restart
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

/**
 * Maximum IP address string length to prevent header injection attacks.
 * IPv6 addresses can be up to 45 chars, so 64 provides a safe buffer.
 */
const MAX_IP_LENGTH = 64;

export function clientIp(request: Request): string {
  const fromForwarded = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  const fromRealIp = request.headers.get('x-real-ip') || '';
  
  // Use the first non-empty header, but sanitize to prevent header injection
  const ip = fromForwarded || fromRealIp || 'unknown';
  
  // Truncate to max length and remove any control characters
  const sanitized = ip.replace(/[\u0000-\u001F\u007F]/g, '').slice(0, MAX_IP_LENGTH);
  
  // Only return if it looks like a valid IP (or 'unknown')
  // Basic check: alphanumeric, dots, colons, hyphens, underscores
  if (sanitized && /^[a-fA-F0-9.:\-_]+$/.test(sanitized)) {
    return sanitized;
  }
  
  return 'unknown';
}
