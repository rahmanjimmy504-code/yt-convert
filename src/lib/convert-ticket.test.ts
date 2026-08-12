import { describe, expect, it } from 'vitest';
import { CONVERT_TICKET_TTL_MS, issueConvertTicket, verifyConvertTicket } from './convert-ticket';

const URL_A = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const URL_B = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
const IP_A = '203.0.113.10';
const IP_B = '198.51.100.20';
const NOW = 1_700_000_000_000;

describe('convert tickets', () => {
  it('issues a ticket that verifies for the same URL and IP', () => {
    const ticket = issueConvertTicket(URL_A, IP_A, NOW);
    expect(ticket).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(verifyConvertTicket(ticket, URL_A, IP_A, NOW + 1000)).toEqual({
      ok: true,
      url: URL_A,
      ip: IP_A,
      exp: NOW + CONVERT_TICKET_TTL_MS,
    });
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

  it('rejects a tampered payload', () => {
    const ticket = issueConvertTicket(URL_A, IP_A, NOW);
    const [payload, sig] = ticket.split('.');
    const tamperedPayload = payload.slice(0, -2) + (payload.endsWith('A') ? 'B' : 'A');
    expect(verifyConvertTicket(`${tamperedPayload}.${sig}`, URL_A, IP_A, NOW + 1000)).toEqual({
      ok: false,
      reason: 'tampered',
    });
  });

  it('rejects a tampered signature', () => {
    const ticket = issueConvertTicket(URL_A, IP_A, NOW);
    const [payload, sig] = ticket.split('.');
    const tamperedSig = sig.slice(0, -2) + (sig.endsWith('A') ? 'B' : 'A');
    expect(verifyConvertTicket(`${payload}.${tamperedSig}`, URL_A, IP_A, NOW + 1000)).toEqual({
      ok: false,
      reason: 'tampered',
    });
  });

  it('rejects missing or malformed tickets', () => {
    expect(verifyConvertTicket('', URL_A, IP_A, NOW)).toEqual({ ok: false, reason: 'missing' });
    expect(verifyConvertTicket('not-a-ticket', URL_A, IP_A, NOW)).toEqual({ ok: false, reason: 'tampered' });
    expect(verifyConvertTicket('abc.', URL_A, IP_A, NOW)).toEqual({ ok: false, reason: 'tampered' });
    expect(verifyConvertTicket('.sig', URL_A, IP_A, NOW)).toEqual({ ok: false, reason: 'tampered' });
  });
});
