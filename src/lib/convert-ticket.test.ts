import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CONVERT_TICKET_TTL_MS,
  isConvertTicketSecretMissing,
  issueConvertTicket,
  verifyConvertTicket,
} from './convert-ticket';

const URL_A = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const URL_B = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
const IP_A = '203.0.113.10';
const IP_B = '198.51.100.20';
const NOW = 1_700_000_000_000;

describe('convert tickets', () => {
  it('issues a versioned ticket that verifies for the same URL and IP', () => {
    const ticket = issueConvertTicket(URL_A, IP_A, NOW);
    expect(ticket).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const [encoded] = ticket.split('.');
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as { v: number; jti: string };
    expect(payload.v).toBe(1);
    expect(payload.jti).toMatch(/^[a-f0-9]{32}$/);
    expect(verifyConvertTicket(ticket, URL_A, IP_A, NOW + 1000)).toEqual({
      ok: true,
      url: URL_A,
      ip: IP_A,
      exp: NOW + CONVERT_TICKET_TTL_MS,
    });
  });

  it('generates a unique jti for every ticket', () => {
    const first = issueConvertTicket(URL_A, IP_A, NOW);
    const second = issueConvertTicket(URL_A, IP_A, NOW);
    const getJti = (ticket: string) => {
      const encoded = ticket.slice(0, ticket.lastIndexOf('.'));
      return (JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as { jti: string }).jti;
    };
    expect(getJti(first)).not.toBe(getJti(second));
  });

  it('rejects a ticket used with a different URL', () => {
    const ticket = issueConvertTicket(URL_A, IP_A, NOW);
    expect(verifyConvertTicket(ticket, URL_B, IP_A, NOW + 1000)).toEqual({ ok: false, reason: 'url' });
  });

  it('rejects a ticket used from a different IP', () => {
    const ticket = issueConvertTicket(URL_A, IP_A, NOW);
    expect(verifyConvertTicket(ticket, URL_A, IP_B, NOW + 1000)).toEqual({ ok: false, reason: 'ip' });
  });

  it('rejects an expired ticket', () => {
    const ticket = issueConvertTicket(URL_A, IP_A, NOW);
    expect(verifyConvertTicket(ticket, URL_A, IP_A, NOW + CONVERT_TICKET_TTL_MS)).toEqual({
      ok: false,
      reason: 'expired',
    });
    expect(verifyConvertTicket(ticket, URL_A, IP_A, NOW + CONVERT_TICKET_TTL_MS + 1)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('still accepts a ticket one millisecond before expiry', () => {
    const ticket = issueConvertTicket(URL_A, IP_A, NOW);
    expect(verifyConvertTicket(ticket, URL_A, IP_A, NOW + CONVERT_TICKET_TTL_MS - 1).ok).toBe(true);
  });

  it('rejects a tampered payload and signature', () => {
    const ticket = issueConvertTicket(URL_A, IP_A, NOW);
    const [payload, sig] = ticket.split('.');
    const tamperedPayload = payload.slice(0, -2) + (payload.endsWith('A') ? 'B' : 'A');
    const tamperedSig = sig.slice(0, -2) + (sig.endsWith('A') ? 'B' : 'A');
    expect(verifyConvertTicket(`${tamperedPayload}.${sig}`, URL_A, IP_A, NOW + 1000)).toEqual({ ok: false, reason: 'tampered' });
    expect(verifyConvertTicket(`${payload}.${tamperedSig}`, URL_A, IP_A, NOW + 1000)).toEqual({ ok: false, reason: 'tampered' });
  });

  it('rejects malformed tickets', () => {
    expect(verifyConvertTicket('', URL_A, IP_A, NOW)).toEqual({ ok: false, reason: 'missing' });
    expect(verifyConvertTicket('not-a-ticket', URL_A, IP_A, NOW)).toEqual({ ok: false, reason: 'tampered' });
    expect(verifyConvertTicket('abc.', URL_A, IP_A, NOW)).toEqual({ ok: false, reason: 'tampered' });
    expect(verifyConvertTicket('.sig', URL_A, IP_A, NOW)).toEqual({ ok: false, reason: 'tampered' });
  });

  it('accepts a live ticket signed with the previous secret during rotation', () => {
    const current = process.env.CONVERT_TICKET_SECRET;
    const previous = process.env.CONVERT_TICKET_SECRET_PREVIOUS;
    try {
      process.env.CONVERT_TICKET_SECRET = 'old-ticket-secret-for-tests';
      delete process.env.CONVERT_TICKET_SECRET_PREVIOUS;
      const ticket = issueConvertTicket(URL_A, IP_A, NOW);
      process.env.CONVERT_TICKET_SECRET = 'new-ticket-secret-for-tests';
      process.env.CONVERT_TICKET_SECRET_PREVIOUS = 'old-ticket-secret-for-tests';
      expect(verifyConvertTicket(ticket, URL_A, IP_A, NOW + 1).ok).toBe(true);
    } finally {
      if (current === undefined) delete process.env.CONVERT_TICKET_SECRET;
      else process.env.CONVERT_TICKET_SECRET = current;
      if (previous === undefined) delete process.env.CONVERT_TICKET_SECRET_PREVIOUS;
      else process.env.CONVERT_TICKET_SECRET_PREVIOUS = previous;
    }
  });
});

describe('convert ticket secret configuration', () => {
  const saved = {
    convert: process.env.CONVERT_TICKET_SECRET,
    captcha: process.env.CAPTCHA_SECRET,
  };

  afterEach(() => {
    if (saved.convert === undefined) delete process.env.CONVERT_TICKET_SECRET;
    else process.env.CONVERT_TICKET_SECRET = saved.convert;
    if (saved.captcha === undefined) delete process.env.CAPTCHA_SECRET;
    else process.env.CAPTCHA_SECRET = saved.captcha;
    vi.restoreAllMocks();
  });

  it('reports a configured secret as present', () => {
    expect(isConvertTicketSecretMissing()).toBe(false);
  });

  it('detects when neither secret is set', () => {
    delete process.env.CONVERT_TICKET_SECRET;
    delete process.env.CAPTCHA_SECRET;
    expect(isConvertTicketSecretMissing()).toBe(true);
  });

  it('falls back to CAPTCHA_SECRET when CONVERT_TICKET_SECRET is absent', () => {
    delete process.env.CONVERT_TICKET_SECRET;
    process.env.CAPTCHA_SECRET = 'fallback-secret';
    expect(isConvertTicketSecretMissing()).toBe(false);
    const ticket = issueConvertTicket(URL_A, IP_A, NOW);
    expect(verifyConvertTicket(ticket, URL_A, IP_A, NOW + 1000)).toMatchObject({ ok: true });
  });

  it('warns when signing without a configured secret', () => {
    delete process.env.CONVERT_TICKET_SECRET;
    delete process.env.CAPTCHA_SECRET;
    const g = globalThis as typeof globalThis & { __ytConvertTicketSecretWarned?: boolean };
    g.__ytConvertTicketSecretWarned = false;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    issueConvertTicket(URL_A, IP_A, NOW);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/CONVERT_TICKET_SECRET/);
    issueConvertTicket(URL_B, IP_B, NOW);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
