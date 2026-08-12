/**
 * Pure YouTube format picking. Innertube / Invidious responses are reduced
 * to this shape so the picker can be unit-tested without network access.
 */

export interface PlayerFormat {
  url?: string;
  mimeType?: string;
  qualityLabel?: string;
  audioQuality?: string;
  bitrate?: number;
  width?: number;
  height?: number;
  itag?: number;
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

export function pickYouTubeFormat(
  formats: PlayerFormat[],
  kind: 'audio' | 'video',
  quality: string = 'best',
): PlayerFormat | null {
  const usable = formats.filter(f => typeof f.url === 'string' && isGoogleVideoUrl(f.url));
  if (kind === 'video') {
    const progressive = usable.filter(isProgressiveMp4);
    if (progressive.length === 0) return null;
    if (quality === 'best' || !/^\d+$/.test(quality)) {
      progressive.sort((a, b) => {
        const h = (b.height || 0) - (a.height || 0);
        if (h) return h;
        return (b.bitrate || 0) - (a.bitrate || 0);
      });
      return progressive[0];
    }
    return pickClosestHeight(progressive, parseInt(quality, 10));
  }

  const audio = usable.filter(isAudioOnly);
  const preferred = audio.filter(isM4a);
  const pool = preferred.length > 0 ? preferred : audio;
  if (pool.length === 0) return null;
  if (quality === 'best' || !/^\d+$/.test(quality)) {
    pool.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
    return pool[0];
  }
  return pickClosestBitrate(pool, parseInt(quality, 10));
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
