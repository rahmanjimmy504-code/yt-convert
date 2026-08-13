/**
 * Shared public Invidious instances (metadata + stream fallback).
 *
 * Public instances commonly set `api: false`, so /api/v1/videos can be 403 or
 * empty even while the browser-facing /latest_version relay still works.
 * The latter is useful with `local=true`: Invidious, not Vercel, fetches the
 * IP-bound googlevideo URL.
 */

import { isAllowedMediaUrl } from './media-hosts';
import type { PlayerFormat } from './youtube-formats';

export const INVIDIOUS_INSTANCES = [
  'https://invidious.tiekoetter.com',
  'https://invidious.f5.si',
  'https://yt.chocolatemoo53.com',
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
] as const;

export function invidiousVideoUrl(base: string, videoId: string): string {
  return `${base.replace(/\/$/, '')}/api/v1/videos/${videoId}`;
}

export function invidiousLatestVersionUrl(base: string, videoId: string, itag: 18 | 140): string {
  const query = new URLSearchParams({ id: videoId, itag: String(itag), local: 'true' });
  return `${base.replace(/\/$/, '')}/latest_version?${query.toString()}`;
}

const LATEST_VERSION_TIMEOUT_MS = 10_000;

async function resolveLatestVersion(base: string, videoId: string, itag: 18 | 140): Promise<string> {
  const requestUrl = invidiousLatestVersionUrl(base, videoId, itag);
  try {
    const response = await fetch(requestUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; YTConvert/1.0)' },
      redirect: 'manual',
      signal: AbortSignal.timeout(LATEST_VERSION_TIMEOUT_MS),
    });
    let resolved = '';
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location) resolved = new URL(location, requestUrl).toString();
    } else if (response.ok) {
      // /latest_version itself can stream the media instead of redirecting.
      // /api/convert will make the real request later, so stop this probe body.
      resolved = requestUrl;
    }
    if (response.body) void response.body.cancel().catch(() => undefined);
    return resolved && isAllowedMediaUrl(resolved) ? resolved : '';
  } catch {
    return '';
  }
}

async function latestVersionFromInstance(base: string, videoId: string): Promise<PlayerFormat[]> {
  const [progressive, audio] = await Promise.all([
    resolveLatestVersion(base, videoId, 18),
    resolveLatestVersion(base, videoId, 140),
  ]);
  const formats: PlayerFormat[] = [];
  if (progressive) {
    formats.push({
      url: progressive,
      mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
      qualityLabel: '360p',
      height: 360,
      audioQuality: 'AUDIO_QUALITY_MEDIUM',
      itag: 18,
    });
  }
  if (audio) {
    formats.push({
      url: audio,
      mimeType: 'audio/mp4; codecs="mp4a.40.2"',
      audioQuality: 'AUDIO_QUALITY_MEDIUM',
      bitrate: 128_000,
      itag: 140,
    });
  }
  return formats;
}

/**
 * Race /latest_version relays. The configured-order winner is used so a dead
 * mirror adds at most one timeout total rather than one timeout per instance.
 */
export async function invidiousLatestVersionFormats(videoId: string): Promise<PlayerFormat[]> {
  const results = await Promise.all(
    INVIDIOUS_INSTANCES.map(base => latestVersionFromInstance(base, videoId)),
  );
  return results.find(formats => formats.length > 0) || [];
}
