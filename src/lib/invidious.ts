/**
 * Shared public Invidious instances (metadata + stream fallback).
 *
 * These are a SECONDARY fallback only. Public instances are routinely
 * rate-limited, have `/api/v1/videos` disabled, or report a 0% playback
 * success ratio, so the Innertube clients in extract.ts stay the primary
 * source of streams. Sorted roughly by observed uptime; a dead instance just
 * costs one skipped request because callers try them in order.
 */
export const INVIDIOUS_INSTANCES = [
  'https://invidious.tiekoetter.com',
  'https://invidious.f5.si',
  'https://yt.chocolatemoo53.com',
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
];

export function invidiousVideoUrl(base: string, videoId: string): string {
  return `${base.replace(/\/$/, '')}/api/v1/videos/${videoId}`;
}
