import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Short-lived HMAC tickets that authorize GET /api/convert after a successful
 * CAPTCHA-gated /api/video-info lookup. Bound to the exact media URL and the
 * client IP so a leaked ticket cannot be replayed against another link or
 * from another address.
 */

export const CONVERT_TICKET_TTL_MS = 10 * 60 * 1000;

const globalForTicket = globalThis as typeof globalThis & { __ytConvertTicketSecret?: string };

function ticketSecret(): string {
  return (
    process.env.CONVERT_TICKET_SECRET ||
    process.env.CAPTCHA_SECRET ||
    (globalForTicket.__ytConvertTicketSecret ??= randomBytes(32).toString('hex'))
  );
}

function sign(payload: string): string {
  return createHmac('sha256', ticketSecret()).update(payload).digest('base64url');
}

function safeEquals(actual: string, expected: string): boolean {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface TicketPayload {
  u: string;
  ip: string;
  exp: number;
}

export type ConvertTicketResult =
  | { ok: true; url: string; ip: string; exp: number }
  | { ok: false; reason: 'missing' | 'tampered' | 'expired' | 'url' | 'ip' };

export function issueConvertTicket(url: string, ip: string, now = Date.now()): string {
  const payload: TicketPayload = { u: url, ip, exp: now + CONVERT_TICKET_TTL_MS };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

export function verifyConvertTicket(
  ticket: string,
  url: string,
  ip: string,
  now = Date.now(),
): ConvertTicketResult {
  if (!ticket) return { ok: false, reason: 'missing' };
  const separator = ticket.lastIndexOf('.');
  if (separator <= 0 || separator === ticket.length - 1) return { ok: false, reason: 'tampered' };

  const encoded = ticket.slice(0, separator);
  const signature = ticket.slice(separator + 1);
  if (!safeEquals(signature, sign(encoded))) return { ok: false, reason: 'tampered' };

  let payload: TicketPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as TicketPayload;
  } catch {
    return { ok: false, reason: 'tampered' };
  }

  if (!payload || typeof payload.u !== 'string' || typeof payload.ip !== 'string' || !Number.isFinite(payload.exp)) {
    return { ok: false, reason: 'tampered' };
  }
  if (payload.exp <= now) return { ok: false, reason: 'expired' };
  if (payload.u !== url) return { ok: false, reason: 'url' };
  if (payload.ip !== ip) return { ok: false, reason: 'ip' };
  return { ok: true, url: payload.u, ip: payload.ip, exp: payload.exp };
}
