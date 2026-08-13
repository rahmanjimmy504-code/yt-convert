/**
 * Piped API client — a mirror fallback after direct Innertube comes up empty.
 *
 * Public Piped instances run NewPipeExtractor server-side, where maintainers
 * keep up with YouTube's PO-token / BotGuard changes. Piped, Invidious, and
 * embed fallbacks are raced so one dead public host cannot serialize several
 * serverless timeouts. A healthy direct Innertube video never pays this hop.
 *
 * Stream URLs come back on each instance's own proxy host (e.g.
 * `pipedproxy-bom.kavin.rocks/videoplayback?...`), not on googlevideo.com.
 * The media-host allowlist in ./media-hosts.ts is what permits those hosts to
 * be proxied by /api/convert.
 */

import { isAllowedMediaUrl } from './media-hosts';
import type { PlayerFormat } from './youtube-formats';

/**
 * Public Piped API instances, queried concurrently and preferred in this
 * order when more than one answers. The official kavin.rocks instance comes
 * first; additional hosts are from TeamPiped's public list and remain
 * best-effort because public instance health changes without notice.
 *
 * Refresh notes (2026-08-12, probed from this environment + TeamPiped docs
 * https://github.com/TeamPiped/documentation/blob/main/content/docs/public-instances/index.md):
 *   - pipedapi.adminforge.de  — REMOVED: subdomain no longer serves Piped
 *     (redirects to the adminforge.de blog).
 *   - pipedapi.leptons.xyz    — REMOVED: Cloudflare 502 on every probe; the
 *     TeamPiped uptime tracker also lists it down.
 *   - pipedapi.drgns.space    — REMOVED: TLS handshake fails
 *     (ERR_SSL_VERSION_OR_CIPHER_MISMATCH).
 *   - pipedapi.ducks.party    — REMOVED: TLS certificate invalid
 *     (ERR_CERT_AUTHORITY_INVALID).
 *   - pipedapi.kavin.rocks    — kept: official instance, still listed in the
 *     docs; could not be probed from this sandbox (Cloudflare blocks the
 *     crawler), rely on the docs + the live verify workflow for it.
 *   - api.piped.private.coffee — added: healthcheck returns OK and the
 *     /streams endpoint answers with real NewPipeExtractor output.
 *   - pipedapi.reallyaweso.me — added: still listed in the docs and the
 *     server answers HTTP 200, though it returns empty bodies to crawlers
 *     (its real health is unverified — the live workflow will show it).
 *   - nosebs, privacy.com.de, owo.si, codespace.cz, darkness.services, and
 *     orangenet.cc — additional documented fallbacks, all raced rather than
 *     serialised. Their proxy suffixes are explicitly allowlisted.
 *
 * Dead instances add at most one shared timeout because all calls run in
 * parallel.
 */
export const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://api.piped.private.coffee',
  'https://pipedapi.reallyaweso.me',
  'https://pipedapi.nosebs.ru',
  'https://piped-api.privacy.com.de',
  'https://pipedapi.owo.si',
  'https://piped-api.codespace.cz',
  'https://pipedapi.darkness.services',
  'https://pipedapi.orangenet.cc',
] as const;

const PIPED_TIMEOUT_MS = 12_000;

/** Trim a trailing slash so URL concatenation is deterministic. */
export function pipedStreamsUrl(base: string, videoId: string): string {
  return `${base.replace(/\/$/, '')}/streams/${encodeURIComponent(videoId)}`;
}

/**
 * The subset of the Piped `/streams/:id` response we consume. Field names and
 * semantics follow the official API docs (docs.piped.video).
 */
interface PipedStreamItem {
  url?: unknown;
  mimeType?: unknown;
  codec?: unknown;
  format?: unknown;
  quality?: unknown;
  bitrate?: unknown;
  height?: unknown;
  width?: unknown;
  fps?: unknown;
  videoOnly?: unknown;
  contentLength?: unknown;
}

interface PipedStreamsResponse {
  title?: unknown;
  uploader?: unknown;
  audioStreams?: PipedStreamItem[];
  videoStreams?: PipedStreamItem[];
  /** Present (and truthy) on age-restricted / private / unavailable videos. */
  error?: unknown;
  /** Some instances surface a machine-readable reason alongside `error`. */
  message?: unknown;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * Build a synthetic itag from a Piped mime type + height/bitrate so that
 * format merging/de-duplication in extract.ts has a stable-ish key even
 * though Piped does not always echo YouTube's itag numbers.
 */
function syntheticItag(item: PipedStreamItem, kind: 'audio' | 'video'): number {
  const mime = asString(item.mimeType) || '';
  const height = asNumber(item.height);
  if (kind === 'video') {
    // Encode height in the high bits so two different heights never collide.
    return 900_000 + (height || 0);
  }
  // Audio: distinguish AAC/m4a from Opus/webm by codec.
  return /opus|webm/i.test(mime) ? 900_251 : 900_140;
}

/**
 * Convert a raw Piped stream object into the internal PlayerFormat shape.
 * MIME types are normalised to include the codec parameter so downstream
 * pickers and extension detection work identically to Innertube formats.
 */
function mapStream(item: PipedStreamItem, kind: 'audio' | 'video'): PlayerFormat {
  let mime = asString(item.mimeType) || (kind === 'video' ? 'video/mp4' : 'audio/mp4');
  const codec = asString(item.codec);
  // Piped occasionally returns a bare mime ("video/mp4") without the codec.
  // Append it when available so isM4a() / avc1 detection behave correctly.
  if (codec && !/;\s*codecs/i.test(mime)) {
    mime = `${mime}; codecs="${codec}"`;
  }
  const bitrate = asNumber(item.bitrate);
  const height = asNumber(item.height);
  const qualityLabel = asString(item.quality) || (height ? `${height}p` : undefined);
  // Piped marks muxed/progressive video streams with videoOnly:false. The
  // shared picker treats a video/mp4 WITH audio as a progressive single-file
  // download; flag those with AUDIO_QUALITY_MEDIUM so they are selected for
  // mp4. Explicitly videoOnly streams are left without it.
  const isVideoOnly = item.videoOnly === true;
  return {
    url: asString(item.url),
    mimeType: mime,
    qualityLabel,
    audioQuality:
      kind === 'audio'
        ? 'AUDIO_QUALITY_MEDIUM'
        : !isVideoOnly
          ? 'AUDIO_QUALITY_MEDIUM'
          : undefined,
    bitrate: bitrate > 0 ? bitrate : undefined,
    width: asNumber(item.width) || undefined,
    height: height || undefined,
    itag: syntheticItag(item, kind),
  };
}

/**
 * What happened on ONE Piped instance during a lookup. Used both for
 * diagnostics (the verify script prints every instance's outcome so "all
 * instances were down" is visible instead of a single lastError) and
 * for the verify script's transient-failure retry decision (5xx / network
 * errors are retried once; age-gate / private / removed are not).
 */
export interface PipedInstanceResult {
  /** API base URL of the instance that was tried. */
  base: string;
  /** True when this instance returned at least one usable stream. */
  ok: boolean;
  /** HTTP status when the instance answered (missing on network errors). */
  httpStatus?: number;
  /**
   * Network-level error message when the request never completed, or the
   * upstream reason string Piped returned for a refused video.
   */
  error?: string;
  /** True when the failure is likely transient (network error or HTTP 5xx). */
  transient?: boolean;
}

/** Outcome of a Piped lookup, carrying a reason when the video is blocked. */
export interface PipedResult {
  formats: PlayerFormat[];
  /** Populated when every instance refused for an explainable reason. */
  error?: string;
  /** Outcome of every instance tried, in order (for diagnostics/retry). */
  instances: PipedInstanceResult[];
}

/**
 * Query the configured Piped instances in order and return the first set of
 * direct stream URLs, or an empty list when none are available.
 *
 * Piped stream URLs point at each instance's own proxy host, not
 * googlevideo.com; callers must accept those hosts (see isAllowedMediaUrl and
 * the PIPED_PROXY_HOSTS allowlist).
 */
interface PipedAttempt {
  outcome: PipedInstanceResult;
  formats: PlayerFormat[];
}

async function queryPipedInstance(base: string, videoId: string): Promise<PipedAttempt> {
  try {
    const response = await fetch(pipedStreamsUrl(base, videoId), {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; YTConvert/1.0)',
      },
      signal: AbortSignal.timeout(PIPED_TIMEOUT_MS),
    });
    if (!response.ok) {
      return {
        formats: [],
        outcome: {
          base,
          ok: false,
          httpStatus: response.status,
          error: `HTTP ${response.status}`,
          // 5xx (including the classic Piped 502 Bad Gateway) is a server
          // problem, not a statement about the video — safe to retry.
          transient: response.status >= 500,
        },
      };
    }
    const data = (await response.json()) as PipedStreamsResponse;

    // Piped returns 200 with an `error` string for age-restricted / private /
    // region-locked / unavailable videos. Keep the reason for diagnostics;
    // another regional instance may still return streams.
    const errorMessage = asString(data.error) || asString(data.message);
    if (errorMessage && (!Array.isArray(data.videoStreams) || data.videoStreams.length === 0)) {
      return {
        formats: [],
        outcome: { base, ok: false, httpStatus: response.status, error: errorMessage, transient: false },
      };
    }

    const audio = (data.audioStreams || []).map(item => mapStream(item, 'audio'));
    const video = (data.videoStreams || []).map(item => mapStream(item, 'video'));
    const formats = [...video, ...audio].filter(
      format => typeof format.url === 'string' && isAllowedMediaUrl(format.url),
    );
    if (formats.length) {
      return { formats, outcome: { base, ok: true, httpStatus: response.status } };
    }
    return {
      formats: [],
      outcome: { base, ok: false, httpStatus: response.status, error: 'no usable streams', transient: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      formats: [],
      outcome: { base, ok: false, error: message, transient: true },
    };
  }
}

export async function pipedFormats(videoId: string): Promise<PipedResult> {
  // Public instances disappear frequently. Querying them serially multiplied
  // a 12-second timeout by the number of dead hosts and exceeded serverless
  // request limits. Race all of them, but preserve configured order when more
  // than one succeeds so behaviour and diagnostics remain deterministic.
  const attempts = await Promise.all(
    PIPED_INSTANCES.map(base => queryPipedInstance(base, videoId)),
  );
  const instances = attempts.map(attempt => attempt.outcome);
  const winner = attempts.find(attempt => attempt.formats.length > 0);
  if (winner) return { formats: winner.formats, instances };
  const lastError = [...instances].reverse().find(instance => instance.error)?.error;
  return { formats: [], error: lastError, instances };
}
