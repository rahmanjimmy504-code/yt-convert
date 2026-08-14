/*
 * YT Convert for Android — GPLv3 companion app.
 * Copyright (C) 2026 rahmanjimmy504-code
 *
 * This file is adapted from the YT Convert website (src/lib/converters.ts),
 * dual-licensed by its copyright holder under the GNU General Public License
 * v3 or later for this repository. Server-side availability probing and the
 * /go handoff route were removed: the app opens converters in the system
 * browser instead.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version. See <https://www.gnu.org/licenses/>.
 */

/**
 * Shared converter catalog and availability checking.
 *
 * The catalog lives here (not in the page component) so the client UI, the
 * health-check API, the report API, and the admin dashboard all read the same
 * list and can never drift apart.
 *
 * Availability checks are deliberately conservative: a converter is
 * "working" only when an actual HTTP probe succeeds. Probes are cached for
 * STATUS_CACHE_TTL_MS so page views don't hammer third-party sites.
 */

import { extractYouTubeId, type FormatKey, type PlatformKey } from './platforms';

export type ConverterStatus = 'working' | 'unavailable' | 'unknown';

/**
 * How to hand the user's media URL to a third-party converter.
 * Default is `clipboard`: we cannot safely auto-fill most third-party sites.
 * Only verified deep links / forms get a non-clipboard protocol.
 */
export type ConverterHandoff =
  | { kind: 'clipboard' }
  | { kind: 'query'; param: string; action?: string }
  | { kind: 'prefix'; prefix: string }
  | { kind: 'youtube-id-query'; action: string; param: string }
  | { kind: 'post'; action: string; field: string };

export interface Converter {
  name: string;
  url: string;
  desc: string;
  color: string;
  platforms: PlatformKey[];
  formats: FormatKey[];
  recommended?: boolean;
  /**
   * Curated Working / Unavailable badge from a human check of the landing
   * page. Live probes still run and can upgrade a site that came back; a
   * curated "working" value also covers bot-challenge false negatives
   * (Cloudflare 403) so the badge matches what a visitor actually sees.
   */
  status: ConverterStatus;
  /** How /go attaches the media URL. Omitted = clipboard (no guessed params). */
  handoff?: ConverterHandoff;
}

export interface ConverterCheckResult {
  name: string;
  url: string;
  status: ConverterStatus;
  /** Epoch ms of the check (reachability probe run on the device). */
  checkedAt: number;
  statusCode?: number;
  latencyMs?: number;
  error?: string;
}

// Converter catalog lives at module scope: it never changes at runtime, so
// there is no reason to rebuild the array on every render.
export const ALL_CONVERTERS: Converter[] = [
  { name: '9Convert', url: 'https://9convert.org/', desc: 'YouTube to MP3 and MP4. Fast and reliable.', color: 'from-rose-500 to-rose-600', platforms: ['youtube', 'youtubemusic'], formats: ['mp3', 'mp4'], recommended: true, status: 'working', handoff: { kind: 'youtube-id-query', action: 'https://embed.dlsrv.online/v2/full', param: 'videoId' } },
  { name: 'AudioConverter', url: 'https://audioconverter.ai/youtube-to-mp4-converter', desc: 'YouTube to MP4. HD and 4K.', color: 'from-sky-500 to-sky-600', platforms: ['youtube', 'youtubemusic'], formats: ['mp4'], status: 'working' },
  { name: 'Hicoo', url: 'https://hicoo.ai/mp4-converter/youtube-to-mp4', desc: 'YouTube to MP4. 360p to 4K.', color: 'from-emerald-500 to-emerald-600', platforms: ['youtube', 'youtubemusic'], formats: ['mp4'], status: 'working' },
  { name: 'KlickAud', url: 'https://klickaud.org/en15', desc: 'SoundCloud to MP3.', color: 'from-orange-400 to-orange-500', platforms: ['soundcloud'], formats: ['mp3'], recommended: true, status: 'working' },
  { name: 'Twitsave', url: 'https://twitsave.com/en', desc: 'Save X/Twitter videos in HD.', color: 'from-indigo-500 to-indigo-600', platforms: ['twitter'], formats: ['mp4'], status: 'working', handoff: { kind: 'query', param: 'url', action: 'https://twitsave.com/info' } },
  { name: 'SaveInsta', url: 'https://saveinsta.to/en1', desc: 'Instagram photos, videos, reels, stories, and highlights.', color: 'from-pink-400 to-pink-500', platforms: ['instagram'], formats: ['mp4'], recommended: true, status: 'working' },
  { name: 'FastDL', url: 'https://fastdl.app/en4', desc: 'Instagram videos, photos, reels, stories, and highlights.', color: 'from-purple-500 to-purple-600', platforms: ['instagram'], formats: ['mp4'], status: 'working', handoff: { kind: 'prefix', prefix: 'https://f-d.app/' } },
  { name: 'SpotDown', url: 'https://spotdown.org/', desc: 'Spotify tracks to MP3.', color: 'from-green-500 to-green-600', platforms: ['spotify'], formats: ['mp3'], recommended: true, status: 'working' },
  { name: 'Lucida', url: 'https://lucida.to/', desc: 'Amazon Music and Deezer audio downloads.', color: 'from-sky-500 to-sky-600', platforms: ['deezer', 'amazonmusic'], formats: ['mp3'], recommended: true, status: 'working', handoff: { kind: 'query', param: 'url' } },
  { name: 'AM Downloader', url: 'https://apple-music-downloader.com/', desc: 'Apple Music to MP3.', color: 'from-gray-600 to-gray-800', platforms: ['applemusic'], formats: ['mp3'], recommended: true, status: 'working' },
  { name: 'SSSTik', url: 'https://ssstik.io/', desc: 'TikTok videos without watermark.', color: 'from-sky-400 to-sky-500', platforms: ['tiktok'], formats: ['mp4'], recommended: true, status: 'working' },
  { name: 'TTSave', url: 'https://ttsave.app/', desc: 'TikTok videos without watermark.', color: 'from-pink-500 to-pink-600', platforms: ['tiktok'], formats: ['mp4'], recommended: true, status: 'working' },
  { name: 'SnapTik', url: 'https://snaptik.app/en3', desc: 'TikTok to MP4, no watermark.', color: 'from-cyan-500 to-cyan-600', platforms: ['tiktok'], formats: ['mp4'], status: 'working' },
  { name: 'FBDown', url: 'https://fdown.net/', desc: 'Facebook videos in HD.', color: 'from-blue-600 to-blue-700', platforms: ['facebook'], formats: ['mp4'], recommended: true, status: 'working', handoff: { kind: 'post', action: 'https://fdown.net/download.php', field: 'URLz' } },
  { name: 'VDFR', url: 'https://vdfr.app/snapchat-video-downloader', desc: 'Download Snapchat videos.', color: 'from-yellow-400 to-yellow-500', platforms: ['snapchat'], formats: ['mp4'], recommended: true, status: 'unavailable' },
  { name: 'ViewSnapStories', url: 'https://viewsnapstories.com/video-downloader', desc: 'Save Snapchat videos fast.', color: 'from-yellow-500 to-yellow-600', platforms: ['snapchat'], formats: ['mp4'], status: 'working' },
];

export function getConverterByName(name: string): Converter | undefined {
  return ALL_CONVERTERS.find(c => c.name === name);
}

export function getConverterHandoff(converter: Converter): ConverterHandoff {
  return converter.handoff ?? { kind: 'clipboard' };
}

/** True only when a verified deep-link / form protocol is configured. */
export function hasAutomaticHandoff(converter: Converter): boolean {
  return getConverterHandoff(converter).kind !== 'clipboard';
}

/** Media URLs we are willing to forward to a third-party converter. */
export function isSafeHandoffMediaUrl(raw: string): boolean {
  if (!raw || raw.length > 2048) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Build the third-party URL that should already contain (or receive) the
 * user's media link, so the converter can pre-fill and usually auto-start.
 */
export function buildConverterLaunchUrl(converter: Converter, mediaUrl: string): string {
  const handoff = getConverterHandoff(converter);
  switch (handoff.kind) {
    case 'prefix':
      return `${handoff.prefix}${mediaUrl}`;
    case 'youtube-id-query': {
      const videoId = extractYouTubeId(mediaUrl);
      if (!videoId) return converter.url;
      const target = new URL(handoff.action);
      target.searchParams.set(handoff.param, videoId);
      return target.toString();
    }
    case 'query': {
      const target = new URL(handoff.action || converter.url);
      target.searchParams.set(handoff.param, mediaUrl);
      return target.toString();
    }
    case 'post':
      return handoff.action;
    case 'clipboard':
    default:
      return converter.url;
  }
}


/** POST actions must stay on the converter's own origin (no open redirect). */
export function isSafePostHandoff(converter: Converter, action: string): boolean {
  try {
    return new URL(action).origin === new URL(converter.url).origin;
  } catch {
    return false;
  }
}
