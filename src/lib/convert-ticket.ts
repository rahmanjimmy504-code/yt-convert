import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { logWarn } from './logging';

/**
 * Short-lived HMAC tickets that authorize GET /api/convert after a successful
 * CAPTCHA-gated /api/video-info lookup. Bound to the exact media URL and the
 * client IP so a leaked ticket cannot be replayed against another link or
 * from another address.
 */

export const CONVERT_TICKET_TTL_MS = 10 * 60 * 1000;

const globalForTicket = globalThis as typeof globalThis & {
  __ytConvertTicketSecret?: string;
  __ytConvertTicketSecretWarned?: boolean;
};

/** True when neither CONVERT_TICKET_SECRET nor CAPTCHA_SECRET is configured. */
export function isConvertTicketSecretMissing(): boolean {
  return !process.env.CONVERT_TICKET_SECRET && !process.env.CAPTCHA_SECRET;
}

function ticketSecret(): string {
  if (isConvertTicketSecretMissing()) {
    // Without a shared secret each serverless instance generates its own
    // random key, so a ticket issued by /api/video-info on one instance fails
    // verification on the instance that serves /api/convert — the user sees
    // "Download ticket is invalid" intermittently. Warn once per process.
    if (!globalForTicket.__ytConvertTicketSecretWarned) {
      globalForTicket.__ytConvertTicketSecretWarned = true;
      logWarn(
        '[convert-ticket] CONVERT_TICKET_SECRET (or CAPTCHA_SECRET) is not set. ' +
          'Falling back to a per-instance random secret: download tickets will fail ' +
          'across serverless instances. Set CONVERT_TICKET_SECRET in production.',
      );
    }
  }
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
