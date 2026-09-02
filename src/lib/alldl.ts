// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * AHM7xMakki AllDL fallback — a free, single-endpoint conversion service,
 * tried AFTER the public mirrors and the 9Convert farm and BEFORE cobalt
 * (which stays the last free resort before the paid Apify Actor).
 *
 * ── The contract ─────────────────────────────────────────────────────────
 * One GET, no key, no body:
 *
 *   https://ahm7xmakki.com/api/alldl?url=<percent-encoded page URL>
 *
 * answers (verified live 2026-09-01) with a flat JSON envelope:
 *
 *   { "success": true,
 *     "links": ["https://tinyurl.com/…", …],          // promotional, ignored
 *     "note": "🚀 Want more free APIs? …",             // promotional, ignored
 *     "mediaInfo": {
 *       "title": "…", "author": "…", "platform": "YouTube",
 *       "videoUrl": "https://c.ymcdn.org/api/v2/download/<token>/<id>?_=<mac>",
 *       "audioUrl": "https://c.ymcdn.org/api/v2/download/<token>/<id>?_=<mac>",
 *       … } }
 *
 * The finished files are announced on the operator's CDN host `c.ymcdn.org`
 * and live traffic 30x-redirects them to rotating `dlNN.ymcdn.org` hosts
 * (verified 2026-09-01). The media allowlist therefore covers the operator's
 * `ymcdn.org` domain as a suffix (like the 9Convert farm CDNs) while the API
 * host `ahm7xmakki.com` stays an exact-host entry; ./media-fetch.ts also
 * pins the Referer to the API origin for every ymcdn.org hop.
 *
 * ── Failure posture ──────────────────────────────────────────────────────
 * Exactly like the farm: this is a best-effort hop. Timeout, HTTP error,
 * non-JSON/HTML challenge page, `success:false`, schema drift, a missing
 * audio/video URL, or a link on any other host all return `[]` so the next
 * provider (cobalt, then Apify) still runs and the visitor ends at the
 * honest "try a converter" message instead of a hard failure.
 *
 * SINGLE ATTEMPT, timeout-bounded: one API call and one bounded byte-range
 * probe. There are deliberately no retries — a dead hobby API must not add
 * more than its own timeout to a conversion that has already walked four
 * free sources.
 *
 * ── Negative health cache ─────────────────────────────────────────────────
 * That one API call still costs up to ALLDL_TIMEOUT_MS (12 s) when the host
 * is down, and it would re-pay that on EVERY download before cobalt could
 * run. After an endpoint-level failure (network error/timeout, non-2xx, or
 * an HTML wall from ahm7xmakki.com itself) the provider remembers the host
 * as down for ALLDL_NEGATIVE_TTL_MS (~5 min, in-process, same pattern as the
 * cobalt directory cache) and the whole AllDL hop is skipped until the
 * cooldown elapses. This is extraction-time-only and never touches
 * authorization: the media-host allowlist is unchanged and cobalt/Apify
 * behave exactly as before. A healthy 200 that simply has no usable
 * rendition (success:false, a missing link, or a failed CDN byte probe) is
 * NOT cached — those are per-video / rotating-node outcomes, including the
 * transient MP3/MP4 flip the /api/convert auto-retry exists to heal.
 *
 * ── Container honesty ────────────────────────────────────────────────────
 * The endpoint does not document what container `audioUrl` really is, and a
 * mislabelled file is worse than no file: /api/convert sniffs magic bytes
 * and refuses to save an M4A as .mp3. The provider therefore Range-probes
 * the first 2 KB of the candidate and accepts it only when the bytes say
 * what the request needs (ID3 / MPEG sync for MP3, `ftyp` MP4 for video).
 * Anything else — including an HTML challenge page — is discarded.
 */

import { isAllowedMediaUrl } from './media-hosts';
import type { PlayerFormat } from './youtube-formats';

export type AlldlKind = 'mp3' | 'mp4';

export const ALLDL_API_ORIGIN = 'https://ahm7xmakki.com';
export const ALLDL_API_BASE = `${ALLDL_API_ORIGIN}/api/alldl`;

/** Exact media hosts this provider may hand back (mirrored in media-hosts). */
export const ALLDL_MEDIA_HOSTS = ['c.ymcdn.org', 'ahm7xmakki.com'] as const;

/** Bounds for the single API call and the single byte-range probe. */
const ALLDL_TIMEOUT_MS = 12_000;
const PROBE_TIMEOUT_MS = 8_000;
const PROBE_BYTES = 2048;

/**
 * How long a dead/unreachable AllDL API endpoint is remembered as down so it
 * is skipped instead of re-timed-out on every download. Mirrors the cobalt
 * directory cache (COBALT_DIRECTORY_TTL_MS): a short, in-process, extraction-
 * time-only negative cache. It never affects authorization — the media-host
 * allowlist is unchanged and every URL is still re-checked — and it caches
 * only the single API HOST being unreachable, never a per-video result.
 */
const ALLDL_NEGATIVE_TTL_MS = 5 * 60 * 1000;

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';

/* -------------------- Negative health cache (endpoint down) ------------- */

const globalForAlldl = globalThis as typeof globalThis & {
  __ytConvertAlldlNegativeAt?: number;
};

/** Test seam: forget a remembered AllDL outage. */
export function resetAlldlNegativeCache(): void {
  delete globalForAlldl.__ytConvertAlldlNegativeAt;
}

/** True when the AllDL API host recently failed and its cooldown has not elapsed. */
function alldlEndpointDown(now: number): boolean {
  const at = globalForAlldl.__ytConvertAlldlNegativeAt;
  return typeof at === 'number' && now - at < ALLDL_NEGATIVE_TTL_MS;
}

/** Remember that the AllDL API host just failed (network/timeout/HTTP wall). */
function markAlldlEndpointDown(now: number): void {
  globalForAlldl.__ytConvertAlldlNegativeAt = now;
}

/** True only for the two exact hosts the AllDL service is known to use. */
export function isAllowedAlldlUrl(raw: string): boolean {
  if (!isAllowedMediaUrl(raw)) return false;
  try {
    const host = new URL(raw).hostname.toLowerCase().replace(/\.$/, '');
    return (ALLDL_MEDIA_HOSTS as readonly string[]).includes(host);
  } catch {
    return false;
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function httpsUrl(value: unknown): string {
  const raw = text(value).replace(/\\u0026/g, '&').replace(/\\\//g, '/');
  return /^https:\/\//i.test(raw) ? raw : '';
}

export interface AlldlDownloads {
  videoUrl?: string;
  audioUrl?: string;
  title?: string;
  author?: string;
}

/**
 * Parse the AllDL envelope. Returns the allowlisted download URLs, or an
 * empty object when the payload is a refusal, malformed, or points at hosts
 * we do not proxy — the caller treats that identically to a network failure.
 */
export function parseAlldlPayload(payload: unknown): AlldlDownloads {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  const record = payload as Record<string, unknown>;
  if (record.success !== true) return {};
  const mediaInfo = record.mediaInfo;
  if (!mediaInfo || typeof mediaInfo !== 'object' || Array.isArray(mediaInfo)) return {};
  const info = mediaInfo as Record<string, unknown>;

  const pick = (value: unknown): string | undefined => {
    const url = httpsUrl(value);
    return url && isAllowedAlldlUrl(url) ? url : undefined;
  };

  return {
    videoUrl: pick(info.videoUrl),
    audioUrl: pick(info.audioUrl),
    title: text(info.title) || undefined,
    author: text(info.author) || undefined,
  };
}

/* ------------------------- Byte sniffing (probe) ------------------------- */

function startsWith(bytes: Uint8Array, needle: Uint8Array): boolean {
  if (bytes.length < needle.length) return false;
  for (let i = 0; i < needle.length; i += 1) {
    if (bytes[i] !== needle[i]) return false;
  }
  return true;
}

function looksLikeHtml(bytes: Uint8Array): boolean {
  const head = new TextDecoder('ascii', { fatal: false })
    .decode(bytes.subarray(0, 512))
    .toUpperCase();
  return /<!DOCTYPE HTML|<HTML|<HEAD|<BODY|<SCRIPT|<!--/.test(head);
}

function hasMpegSync(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length - 1, 1024);
  for (let i = 0; i < limit; i += 1) {
    if (bytes[i] !== 0xff) continue;
    const second = bytes[i + 1];
    if ((second & 0xe0) !== 0xe0) continue;
    const version = (second >> 3) & 0x03;
    const layer = (second >> 1) & 0x03;
    if (version === 0x01 || layer === 0x00) continue;
    return true;
  }
  return false;
}

/** What the first bytes of a response actually are. */
export function sniffAlldlContainer(bytes: Uint8Array): 'mp3' | 'mp4' | 'other' {
  if (!bytes.length || looksLikeHtml(bytes)) return 'other';
  if (startsWith(bytes, new TextEncoder().encode('ID3')) || hasMpegSync(bytes)) return 'mp3';
  if (bytes.length >= 12 && startsWith(bytes.subarray(4), new TextEncoder().encode('ftyp'))) {
    return 'mp4';
  }
  return 'other';
}

/**
 * Read at most `max` bytes from a response body, then cancel the stream so a
 * server that ignores Range cannot make us buffer a multi-GB file.
 */
async function readProbePrefix(response: Response, max = PROBE_BYTES): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (length < max) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.length) continue;
      const take = value.subarray(0, Math.min(value.length, max - length));
      chunks.push(take);
      length += take.length;
    }
  } finally {
    try { await reader.cancel(); } catch { /* already closed */ }
  }
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Bounded byte-range probe that reports what container the candidate URL
 * actually serves ('other' on any failure). Network errors, HTTP errors and
 * HTML all collapse to 'other'.
 */
async function probeContainer(url: string): Promise<'mp3' | 'mp4' | 'other'> {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: '*/*',
        Range: `bytes=0-${PROBE_BYTES - 1}`,
        Referer: `${ALLDL_API_ORIGIN}/`,
        'User-Agent': BROWSER_UA,
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!response.ok && response.status !== 206) {
      try { await response.body?.cancel(); } catch { /* drain */ }
      return 'other';
    }
    return sniffAlldlContainer(await readProbePrefix(response));
  } catch {
    return 'other';
  }
}

/** Accept a candidate only when its bytes match the requested container. */
function probeMatchesKind(container: 'mp3' | 'mp4' | 'other', kind: AlldlKind): boolean {
  return container === kind;
}

/** Wrap the finished file in one PlayerFormat (same convention as apify.ts). */
function toFormat(url: string, kind: AlldlKind): PlayerFormat {
  return kind === 'mp4'
    ? {
        url,
        mimeType: 'video/mp4',
        audioQuality: 'AUDIO_QUALITY_MEDIUM',
        bitrate: 0,
        height: 0,
        itag: 0,
      }
    : {
        url,
        mimeType: 'audio/mpeg',
        audioQuality: 'AUDIO_QUALITY_MEDIUM',
        bitrate: 0,
        height: 0,
        itag: 0,
      };
}

/**
 * Ask the AHM7xMakki AllDL endpoint for one finished file.
 *
 * Single bounded attempt; every failure returns `[]` so the caller falls
 * through to cobalt / the honest error. `videoId` must be the 11-character
 * YouTube id.
 */
export async function alldlFormats(videoId: string, kind: AlldlKind): Promise<PlayerFormat[]> {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return [];

  // Skip the hop entirely while the endpoint is in its short negative-cache
  // window, so a dead AllDL API costs us a single cached flag rather than its
  // full 12 s timeout on every download. This is purely an extraction-time
  // optimization: cobalt/Apify still run exactly as before, and the negative
  // entry expires on its own, so a recovered endpoint is retried after the
  // TTL. A per-video miss (a 200 answer with no usable rendition) is NOT a
  // dead endpoint and is deliberately never cached.
  const now = Date.now();
  if (alldlEndpointDown(now)) return [];

  const endpoint = `${ALLDL_API_BASE}?url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${videoId}`,
  )}`;

  let payload: unknown = null;
  try {
    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json', 'User-Agent': BROWSER_UA },
      redirect: 'follow',
      signal: AbortSignal.timeout(ALLDL_TIMEOUT_MS),
    });
    if (!response.ok) {
      try { await response.body?.cancel(); } catch { /* drain */ }
      // A refused/erroring API host is the durable outage we want to skip for
      // a few minutes.
      markAlldlEndpointDown(Date.now());
      return [];
    }
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType && !/json|text\/plain/i.test(contentType)) {
      // An HTML challenge or a soft error page — never parse it. An HTML wall
      // from the API host itself is an endpoint-level failure, not a per-video
      // miss, so it earns the short negative cooldown too.
      try { await response.body?.cancel(); } catch { /* drain */ }
      markAlldlEndpointDown(Date.now());
      return [];
    }
    payload = await response.json().catch(() => null);
  } catch {
    // Network error / the 12 s timeout — the outage the negative cache exists
    // to avoid re-paying.
    markAlldlEndpointDown(Date.now());
    return [];
  }

  const downloads = parseAlldlPayload(payload);
  const candidate = kind === 'mp3' ? downloads.audioUrl : downloads.videoUrl;
  if (!candidate) return [];

  // Container honesty: accept the link only when its bytes say what the
  // request needs, so /api/convert never has to reject a mislabelled file.
  const container = await probeContainer(candidate);
  if (!probeMatchesKind(container, kind)) return [];

  // Rendition-distinctness check (video only): the endpoint's video and audio
  // links share one token path and differ only in a MAC query parameter, and
  // its rotating dlNN. CDN nodes have been observed serving the SAME bytes on
  // both. When audioUrl also sniffs as MP4 the routing is broken right now —
  // refusing here hands the request to cobalt instead of letting /api/convert
  // discover a wrong-container body seconds later. (Verified live 2026-09-01:
  // a healthy answer is videoUrl=ftyp MP4 + audioUrl=ID3/MPEG MP3.)
  if (kind === 'mp4' && downloads.audioUrl) {
    const audioSniff = await probeContainer(downloads.audioUrl);
    if (audioSniff === 'mp4') return [];
  }

  return [toFormat(candidate, kind)];
}
