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

export function pickYouTubeFormat(
  formats: PlayerFormat[],
  kind: 'audio' | 'video',
): PlayerFormat | null {
  const usable = formats.filter(f => typeof f.url === 'string' && isGoogleVideoUrl(f.url));
  if (kind === 'video') {
    const progressive = usable.filter(isProgressiveMp4);
    progressive.sort((a, b) => {
      const h = (b.height || 0) - (a.height || 0);
      if (h) return h;
      return (b.bitrate || 0) - (a.bitrate || 0);
    });
    return progressive[0] || null;
  }

  const audio = usable.filter(isAudioOnly);
  const preferred = audio.filter(isM4a);
  const pool = preferred.length > 0 ? preferred : audio;
  pool.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
  return pool[0] || null;
}

/** File extension that matches the real container. Never labels AAC as .mp3. */
export function extensionForMime(mime: string, fallback: 'm4a' | 'mp3' | 'mp4' | 'bin' = 'bin'): string {
  const m = mime.toLowerCase();
  if (/audio\/mpeg|audio\/mp3/.test(m)) return 'mp3';
  if (/audio\/(mp4|aac|x-m4a)|mp4a/.test(m)) return 'm4a';
  if (/audio\/ogg|application\/ogg/.test(m)) return 'ogg';
  if (/audio\/webm|opus/.test(m)) return 'webm';
  if (/video\/mp4|application\/mp4/.test(m)) return 'mp4';
  if (/video\/webm/.test(m)) return 'webm';
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
