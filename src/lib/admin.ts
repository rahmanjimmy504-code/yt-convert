import { timingSafeEqual } from 'node:crypto';

/**
 * Admin auth for the status dashboard.
 *
 * /api/status and /status are unlocked with a Bearer token set via the
 * ADMIN_TOKEN environment variable. Without a token the dashboard is
 * disabled entirely (the API returns 404), so a default deployment exposes
 * nothing.
 */

export function getAdminToken(): string {
  return process.env.ADMIN_TOKEN || '';
}

export function isAdminEnabled(): boolean {
  const token = getAdminToken();
  // Reject empty and obviously weak tokens (e.g. "test").
  return token.length >= 16;
}

export function verifyAdminAuth(request: Request): boolean {
  const expected = getAdminToken();
  if (!expected) return false;
  const header = request.headers.get('authorization') || '';
  const provided = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
