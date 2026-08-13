/**
 * Pure YouTube format picking. Innertube / Invidious responses are reduced
 * to this shape so the picker can be unit-tested without network access.
 */

import { isAllowedMediaUrl } from './media-hosts';

export interface PlayerFormat {
  url?: string;
  mimeType?: string;
  qualityLabel?: string;
  audioQuality?: string;
  bitrate?: number;
  width?: number;
  height?: number;
  itag?: number;
  /** Innertube client that minted this URL (server-side token binding only). */
  sourceClient?: string;
}

export function isGoogleVideoUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;
    const host = parsed.hostname.toLowerCase();
    return host === 'googlevideo.com' || host.endsWith('.googlevideo.com');
  } catch {
    return false;
  }
}

/**
 * A format URL is usable when it is either a direct googlevideo.com link
 * (Innertube / Invidious) OR an allowlisted third-party media CDN (the
 * Piped fallback serves from pipedproxy.* hosts). Centralising this check
 * keeps every picker path SSRF-safe without forcing every caller to know
 * which upstream a format came from.
 */
export function isUsableFormatUrl(raw: string): boolean {
  if (typeof raw !== 'string' || raw.length === 0) return false;
  return isGoogleVideoUrl(raw) || isAllowedMediaUrl(raw);
}

function mimeOf(format: PlayerFormat): string {
  return format.mimeType || '';
}

function hasAudio(format: PlayerFormat): boolean {
  return Boolean(format.audioQuality) || /audio\//i.test(mimeOf(format));
}

function isProgressiveMp4(format: PlayerFormat): boolean {
  const mime = mimeOf(format);
  return /video\/mp4/i.test(mime) && hasAudio(format) && !/audio\/only/i.test(mime);
}

/** A video-only adaptive MP4: H.264 video with no audio track of its own. */
function isVideoOnlyMp4(format: PlayerFormat): boolean {
  const mime = mimeOf(format);
  return /video\/mp4/i.test(mime) && !hasAudio(format);
}

function isAudioOnly(format: PlayerFormat): boolean {
  const mime = mimeOf(format);
  if (/video\//i.test(mime)) return false;
  return /audio\//i.test(mime) || Boolean(format.audioQuality && !format.qualityLabel && !format.height);
}

function isM4a(format: PlayerFormat): boolean {
  return /audio\/(mp4|aac|x-m4a)|mp4a/i.test(mimeOf(format));
}

/** Audio bitrate options (kbps) shown in the UI and accepted by the API. */
export const AUDIO_KBPS_OPTIONS = ['best', '320', '256', '192', '128', '64'] as const;
/** Video resolution options (height, without the p) shown in the UI/API. */
export const VIDEO_QUALITY_OPTIONS = ['best', '1080', '720', '480', '360'] as const;
export type AudioQuality = (typeof AUDIO_KBPS_OPTIONS)[number];
export type VideoQuality = (typeof VIDEO_QUALITY_OPTIONS)[number];

/** Validates the `quality` query param against the chosen format. */
export function isValidQuality(format: 'mp3' | 'mp4', quality: string): boolean {
  return format === 'mp3'
    ? (AUDIO_KBPS_OPTIONS as readonly string[]).includes(quality)
    : (VIDEO_QUALITY_OPTIONS as readonly string[]).includes(quality);
}

function pickClosestHeight(list: PlayerFormat[], target: number): PlayerFormat | null {
  if (list.length === 0) return null;
  // Prefer the highest resolution at or below the target.
  const atOrBelow = list.filter(f => (f.height || 0) <= target);
  if (atOrBelow.length > 0) {
    atOrBelow.sort((a, b) => {
      const h = (b.height || 0) - (a.height || 0);
      if (h) return h;
      return (b.bitrate || 0) - (a.bitrate || 0);
    });
    return atOrBelow[0];
  }
  // Nothing small enough: fall back to the lowest resolution available
  // (closest above the target) rather than failing the download.
  const above = list.slice();
  above.sort((a, b) => {
    const h = (a.height || 0) - (b.height || 0);
    if (h) return h;
    return (a.bitrate || 0) - (b.bitrate || 0);
  });
  return above[0];
}

function pickClosestBitrate(list: PlayerFormat[], targetKbps: number): PlayerFormat | null {
  if (list.length === 0) return null;
  const kbps = (f: PlayerFormat) => Math.round((f.bitrate || 0) / 1000);
  // Prefer the highest bitrate at or below the target.
  const atOrBelow = list.filter(f => kbps(f) <= targetKbps);
  if (atOrBelow.length > 0) {
    atOrBelow.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
    return atOrBelow[0];
  }
  // Otherwise the lowest available bitrate (closest above the target).
  const above = list.slice();
  above.sort((a, b) => (a.bitrate || 0) - (b.bitrate || 0));
  return above[0];
}

/**
 * Best progressive MP4 for a quality selection, mirroring the picker rules:
 * 'best' (or unrecognized) → highest; numeric → closest height at-or-below,
 * else the lowest available (closest above).
 */
function pickProgressiveForQuality(progressive: PlayerFormat[], quality: string): PlayerFormat | null {
  if (quality === 'best' || !/^\d+$/.test(quality)) {
    progressive.sort((a, b) => {
      const h = (b.height || 0) - (a.height || 0);
      if (h) return h;
      return (b.bitrate || 0) - (a.bitrate || 0);
    });
    return progressive[0] ?? null;
  }
  return pickClosestHeight(progressive, parseInt(quality, 10));
}

export function pickYouTubeFormat(
  formats: PlayerFormat[],
  kind: 'audio' | 'video',
  quality: string = 'best',
): PlayerFormat | null {
  const usable = formats.filter(f => typeof f.url === 'string' && isUsableFormatUrl(f.url));
  if (kind === 'video') {
    return pickProgressiveForQuality(usable.filter(isProgressiveMp4), quality);
  }

  const audio = usable.filter(isAudioOnly);
  const preferred = audio.filter(isM4a);
  const pool = preferred.length > 0 ? preferred : audio;
  // Music-label videos (e.g. Tobu – Hope) often expose only a progressive
  // itag 18 and no adaptive audio. 9convert still converts those by taking
  // the muxed file. We do the same as a last resort — the container stays
  // honest (usually .mp4 / .m4a), never relabelled as MP3.
  if (pool.length === 0) {
    return pickProgressiveForQuality(usable.filter(isProgressiveMp4), 'best');
  }
  if (quality === 'best' || !/^\d+$/.test(quality)) {
    pool.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
    return pool[0];
  }
  return pickClosestBitrate(pool, parseInt(quality, 10));
}

/**
 * What it would take to honour a video quality request with the formats on
 * hand. Phase 1: pure selection logic only — nothing here spawns a binary or
 * changes what pickYouTubeFormat() returns. The result card uses this to stop
 * silently downgrading ("you asked for 1080p, here is 360p").
 *
 * - kind 'progressive': a single progressive MP4 already meets the target.
 *   Zero cost; identical to today's download.
 * - kind 'mux': the target only exists as separate video-only + audio-only
 *   adaptive tracks. `video` is the best H.264 (avc1) video-only MP4 at or
 *   below the target (avc1 preferred over vp9/av01 so a later stream-copy
 *   remux stays valid in MP4) and `audio` is the best AAC audio-only track.
 * - null: nothing usable was found at all.
 *
 * When a mux cannot be assembled (no video-only track or no audio track),
 * the plan falls back to the progressive stream rather than planning a
 * silent or impossible download.
 */
export interface MuxPlan {
  kind: 'progressive' | 'mux';
  video: PlayerFormat;
  audio?: PlayerFormat;
}

/** Highest height available across the usable formats (0 when unknown). */
function maxHeight(usable: PlayerFormat[]): number {
  return usable.reduce((max, f) => Math.max(max, f.height || 0), 0);
}

export function planVideoDownload(formats: PlayerFormat[], quality: string): MuxPlan | null {
  const usable = formats.filter(f => typeof f.url === 'string' && isUsableFormatUrl(f.url));
  if (usable.length === 0) return null;

  const progressive = usable.filter(isProgressiveMp4);
  const progressivePick = pickProgressiveForQuality(progressive, quality);

  // The target the user asked for: the numeric height, or — for 'best' — the
  // best height any usable format offers.
  const numeric = /^\d+$/.test(quality);
  const target = numeric ? parseInt(quality, 10) : maxHeight(usable);

  // Zero-cost path: a single progressive MP4 already meets the target.
  if (progressivePick && (progressivePick.height || 0) >= target) {
    return { kind: 'progressive', video: progressivePick };
  }

  // Mux path: best video-only avc1 MP4 at or below the target, paired with
  // the best AAC audio-only track.
  const videoOnly = usable.filter(isVideoOnlyMp4);
  const avc1 = videoOnly.filter(f => /avc1/i.test(mimeOf(f)));
  const videoPool = avc1.length > 0 ? avc1 : videoOnly;
  const videoPick = videoPool.length > 0 ? pickClosestHeight(videoPool, target) : null;

  const audioOnly = usable.filter(isAudioOnly);
  const m4a = audioOnly.filter(isM4a);
  const audioPool = m4a.length > 0 ? m4a : audioOnly;
  const audioPick =
    audioPool.length > 0 ? [...audioPool].sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0] : null;

  if (videoPick && audioPick) {
    return { kind: 'mux', video: videoPick, audio: audioPick };
  }

  // No way to pair audio with a video-only track: fall back to the
  // progressive stream rather than planning a silent video.
  return progressivePick ? { kind: 'progressive', video: progressivePick } : null;
}

/**
 * Per-option summary of what each VIDEO_QUALITY_OPTIONS entry would require,
 * shipped to the result card so it can stop silently downgrading.
 *
 * `height` is the height the *current single-file download* delivers (the
 * progressive pick), which is what the user actually receives today.
 */
export interface VideoQualityPlan {
  quality: VideoQuality;
  kind: 'progressive' | 'mux' | 'none';
  height?: number;
}

export function videoQualityPlans(formats: PlayerFormat[]): VideoQualityPlan[] {
  return VIDEO_QUALITY_OPTIONS.map(quality => {
    const plan = planVideoDownload(formats, quality);
    if (!plan) return { quality, kind: 'none' };
    if (plan.kind === 'progressive') {
      return { quality, kind: 'progressive', height: plan.video.height || undefined };
    }
    // A mux is what would be needed; the single-file download delivers the
    // closest progressive stream (and may not exist at all).
    const delivered = pickYouTubeFormat(formats, 'video', quality);
    return { quality, kind: 'mux', height: delivered?.height || undefined };
  });
}

/** File extension that matches the real container. Never labels AAC as .mp3. */
export function extensionForMime(mime: string, fallback: 'm4a' | 'mp3' | 'mp4' | 'bin' = 'bin'): string {
  const m = mime.toLowerCase();
  // Check video containers first: a progressive video/mp4 codec string often
  // contains an audio codec such as "mp4a.40.2", so matching the audio codec
  // token first would wrongly label a video file .m4a.
  if (/video\/mp4|application\/mp4/.test(m)) return 'mp4';
  if (/video\/webm/.test(m)) return 'webm';
  if (/audio\/mpeg|audio\/mp3/.test(m)) return 'mp3';
  if (/audio\/(mp4|aac|x-m4a)/.test(m)) return 'm4a';
  // The bare "mp4a" token only applies when the MIME type is not already a
  // video container (otherwise it is just the audio track inside an MP4).
  if (!/^video\//.test(m) && /mp4a/.test(m)) return 'm4a';
  if (/audio\/ogg|application\/ogg/.test(m)) return 'ogg';
  if (/audio\/webm|opus/.test(m)) return 'webm';
  return fallback;
}

export function sanitizeDownloadFilename(title: string, ext: string): string {
  const base =
    title
      .normalize('NFKD')
      .replace(/[\u0000-\u001F\u007F]/g, '')
      .replace(/[\\/:*?"<>|]+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'download';
  const cleanExt = ext.replace(/[^a-z0-9]/gi, '') || 'bin';
  return `${base}.${cleanExt}`;
}
