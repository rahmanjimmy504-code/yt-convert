import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Short-lived HMAC tickets that authorize GET /api/convert after a successful
 * CAPTCHA-gated /api/video-info lookup. Bound to the exact media URL and the
 * client IP so a leaked ticket cannot be replayed against another link or
 * from another address.
 *
 * Ticket signing is intentionally stateless so the app does not require a
 * paid database or cache. CONVERT_TICKET_SECRET is the active signing key;
 * CONVERT_TICKET_SECRET_PREVIOUS can temporarily hold the previous key during
 * a zero-downtime secret rotation.
 */

export const CONVERT_TICKET_TTL_MS = 10 * 60 * 1000;

const globalForTicket = globalThis as typeof globalThis & {
  __ytConvertTicketSecret?: string;
  __ytConvertTicketSecretWarned?: boolean;
};

export function isConvertTicketSecretMissing(): boolean {
  return !process.env.CONVERT_TICKET_SECRET && !process.env.CAPTCHA_SECRET;
}

function primarySecret(): string {
  if (isConvertTicketSecretMissing()) {
    if (!globalForTicket.__ytConvertTicketSecretWarned) {
      globalForTicket.__ytConvertTicketSecretWarned = true;
      console.warn(
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

function verificationSecrets(): string[] {
  const current = primarySecret();
  const previous = process.env.CONVERT_TICKET_SECRET_PREVIOUS?.trim();
  return previous && previous !== current ? [current, previous] : [current];
}

function sign(payload: string, secret = primarySecret()): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function safeEquals(actual: string, expected: string): boolean {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface TicketPayload {
  v: 1;
  jti: string;
  u: string;
  ip: string;
  exp: number;
}

export type ConvertTicketResult =
  | { ok: true; url: string; ip: string; exp: number }
  | { ok: false; reason: 'missing' | 'tampered' | 'expired' | 'url' | 'ip' };

export function issueConvertTicket(url: string, ip: string, now = Date.now()): string {
  const payload: TicketPayload = {
    v: 1,
    jti: randomBytes(16).toString('hex'),
    u: url,
    ip,
    exp: now + CONVERT_TICKET_TTL_MS,
  };
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
  const signatureValid = verificationSecrets().some((secret) => safeEquals(signature, sign(encoded, secret)));
  if (!signatureValid) return { ok: false, reason: 'tampered' };

  let payload: TicketPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as TicketPayload;
  } catch {
    return { ok: false, reason: 'tampered' };
  }

  if (
    !payload ||
    payload.v !== 1 ||
    typeof payload.jti !== 'string' ||
    payload.jti.length < 16 ||
    typeof payload.u !== 'string' ||
    typeof payload.ip !== 'string' ||
    !Number.isFinite(payload.exp)
  ) {
    return { ok: false, reason: 'tampered' };
  }
  if (payload.exp <= now) return { ok: false, reason: 'expired' };
  if (payload.u !== url) return { ok: false, reason: 'url' };
  if (payload.ip !== ip) return { ok: false, reason: 'ip' };
  return { ok: true, url: payload.u, ip: payload.ip, exp: payload.exp };
}
