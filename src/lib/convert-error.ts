/**
 * Presentation helper for the failed in-site-download message on the home
 * page. Kept as a pure, unit-tested lib function (same pattern as
 * ./download-panel) so the wording rule cannot silently regress.
 *
 * The server already ends most `/api/convert` errors with exactly one
 * actionable pointer ("Use the 9Convert option below.", "Try a converter
 * below.", …). The client used to unconditionally stack another sentence on
 * top, which produced double instructions — a bot check read:
 *
 *   "YouTube served a bot check (…) for this server's IP. Use the 9Convert
 *    option below. Try an on-device Android app above or a converter below."
 *
 * That defeats the single-action guarantee the server-side `withFallbackHint`
 * (see ./extract) enforces. We therefore add a tail ONLY when the message has
 * no pointer yet, and tailor it to whether the on-device Android block is
 * actually rendered (YouTube / YouTube Music only).
 */

/**
 * Return the trailing sentence to append after a convert error, or '' when
 * the message already tells the visitor what to do next.
 *
 * @param onDeviceBlockShown true when the page is rendering the
 *   "Download with a free Android app" block (YouTube platforms only).
 */
export function clientFallbackTail(message: string, onDeviceBlockShown: boolean): string {
  const trimmed = (message || '').trim();
  if (!trimmed) {
    return 'Try an on-device Android app above or a converter below.';
  }
  // Every server-authored pointer ("Use the 9Convert option below.", "Try a
  // converter below.", …) references something above/below; match on that
  // rather than re-listing each phrasing so new wordings are covered too.
  if (/\b(above|below)\b/i.test(trimmed)) return '';
  return onDeviceBlockShown
    ? ' Try an on-device Android app above or a converter below.'
    : ' Try a converter below.';
}
