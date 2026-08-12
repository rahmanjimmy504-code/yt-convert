/**
 * Piped API client — a TERTIARY fallback for YouTube videos that the
 * Innertube clients and Invidious instances cannot serve.
 *
 * Public Piped instances run NewPipeExtractor server-side, where the
 * maintainers keep up with YouTube's PO-token / BotGuard challenges so
 * individual self-hosters don't have to. That makes Piped the most reliable
 * fallback for music-label and otherwise-throttled videos. We only reach for
 * it after every direct Innertube client and every Invidious instance has
 * already come up empty, so a healthy video never pays the extra hop.
 *
 * Stream URLs come back on each instance's own proxy host (e.g.
 * `pipedproxy-bom.kavin.rocks/videoplayback?...`), not on googlevideo.com.
 * The media-host allowlist in ./media-hosts.ts is what permits those hosts to
 * be proxied by /api/convert.
 */

import type { PlayerFormat } from './youtube-formats';

/**
 * Public Piped API instances, tried in order until one answers with streams.
 * Sorted roughly by observed uptime / capacity; the official kavin.rocks
 * instance first because it fronts multiple regional edge proxies.
 *
 * The list mirrors TeamPiped's documented public instances
 * (https://docs.piped.video/docs/api-documentation/). Dead instances simply
 * cost one skipped request because callers try them in order and move on.
 */
export const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.drgns.space',
  'https://pipedapi.ducks.party',
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

/** Outcome of a Piped lookup, carrying a reason when the video is blocked. */
export interface PipedResult {
  formats: PlayerFormat[];
  /** Populated when every instance refused for an explainable reason. */
  error?: string;
}

/**
 * Query the configured Piped instances in order and return the first set of
 * direct stream URLs, or an empty list when none are available.
 *
 * Piped stream URLs point at each instance's own proxy host, not
 * googlevideo.com; callers must accept those hosts (see isAllowedMediaUrl and
 * the PIPED_PROXY_HOSTS allowlist).
 */
export async function pipedFormats(videoId: string): Promise<PipedResult> {
  let lastError: string | undefined;

  for (const base of PIPED_INSTANCES) {
    try {
      const response = await fetch(pipedStreamsUrl(base, videoId), {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; YTConvert/1.0)',
        },
        signal: AbortSignal.timeout(PIPED_TIMEOUT_MS),
      });
      if (!response.ok) {
        lastError = `Piped instance returned HTTP ${response.status}`;
        continue;
      }
      const data = (await response.json()) as PipedStreamsResponse;

      // Piped returns 200 with an `error` string for age-restricted / private /
      // region-locked / unavailable videos. Capture it but keep trying — a
      // different instance may still have the stream.
      const errorMessage = asString(data.error) || asString(data.message);
      if (errorMessage && (!Array.isArray(data.videoStreams) || data.videoStreams.length === 0)) {
        lastError = errorMessage;
        continue;
      }

      const audio = (data.audioStreams || []).map(item => mapStream(item, 'audio'));
      const video = (data.videoStreams || []).map(item => mapStream(item, 'video'));
      const formats = [...video, ...audio].filter(
        f => typeof f.url === 'string' && /^https:\/\//i.test(f.url),
      );
      if (formats.length > 0) return { formats };
    } catch {
      // Network error / timeout / malformed JSON — try the next instance.
    }
  }

  return { formats: [], error: lastError };
}
