/**
 * Minimal first-party cookie helpers for the cookie-consent banner.
 *
 * YT Convert has no tracking or advertising cookies: the only cookie the site
 * ever writes is `yt-convert-consent`, which records the visitor's choice on
 * the consent notice so it isn't shown on every visit. Preferences (dark
 * mode, history, favorite converter, format) intentionally stay in the
 * browser's localStorage instead.
 */

export const CONSENT_COOKIE = 'yt-convert-consent';
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

/** Window event the footer "Cookie settings" link dispatches to reopen the banner. */
export const OPEN_COOKIE_PREFERENCES_EVENT = 'yt-convert:open-cookie-preferences';

export type ConsentChoice = 'accepted' | 'declined' | 'dismissed';

const CHOICES: ReadonlySet<string> = new Set<ConsentChoice>(['accepted', 'declined', 'dismissed']);

/** Parse a raw Cookie header value and return the value for `name`, if any. */
export function parseCookieHeader(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === name) return value || null;
  }
  return null;
}

/** Read a cookie in the browser. Returns null when absent or outside a browser. */
export function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  return parseCookieHeader(document.cookie, name);
}

/** Read the visitor's stored consent choice, if any (null = no choice yet). */
export function getConsentChoice(): ConsentChoice | null {
  const value = readCookie(CONSENT_COOKIE);
  return value !== null && CHOICES.has(value) ? (value as ConsentChoice) : null;
}

/**
 * Persist the consent choice in a first-party cookie so the banner doesn't
 * reappear. `SameSite=Lax` keeps the cookie off cross-site requests; `Secure`
 * is intentionally omitted so the banner also works over plain HTTP in local
 * development (production is HTTPS via the platform).
 */
export function setConsentChoice(choice: ConsentChoice): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${CONSENT_COOKIE}=${choice}; max-age=${CONSENT_MAX_AGE_SECONDS}; path=/; SameSite=Lax`;
}
