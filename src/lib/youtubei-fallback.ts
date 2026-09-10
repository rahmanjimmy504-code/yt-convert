/**
 * Last-resort YouTube.js / InnerTube fallback.
 *
 * This deliberately sits behind the existing embed extractor. It uses the
 * Cloudflare-Workers build of youtubei.js and only accepts formats that
 * already contain a direct URL, so it does not require a Node runtime,
 * ffmpeg, a sidecar, or a paid API.
 *
 * Best-effort only: YouTube can block Cloudflare/datacenter egress IPs, and
 * youtubei.js tracks an undocumented YouTube API that can change at any time.
 */

import { Innertube } from 'youtubei.js/cf-worker';
import { isAllowedMediaUrl } from './media-hosts';
import type { PlayerFormat } from './youtube-formats';

const FALLBACK_TIMEOUT_MS = 10_000;

let clientPromise: Promise<Innertube> | undefined;

async function getClient(): Promise<Innertube> {
  if (!clientPromise) {
    clientPromise = Innertube.create({
      // Direct URLs are the only thing this fallback consumes. Disabling the
      // player keeps initialization lighter and avoids requiring a JS
      // interpreter in the Cloudflare Worker.
      retrieve_player: false,
      lang: 'en',
      location: 'US',
    });
  }
  return clientPromise;
}

function toPlayerFormats(info: unknown): PlayerFormat[] {
  const root = info as {
    streaming_data?: {
      formats?: unknown[];
      adaptive_formats?: unknown[];
    };
  };
  const streaming = root?.streaming_data;
  const raw = [
    ...(Array.isArray(streaming?.formats) ? streaming.formats : []),
    ...(Array.isArray(streaming?.adaptive_formats) ? streaming.adaptive_formats : []),
  ];

  const output: PlayerFormat[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as Record<string, unknown>;
    const url = typeof candidate.url === 'string' ? candidate.url : '';
    if (!url || !isAllowedMediaUrl(url)) continue;

    const mimeType = typeof candidate.mime_type === 'string'
      ? candidate.mime_type
      : typeof candidate.mimeType === 'string'
        ? candidate.mimeType
        : '';

    output.push({
      url,
      mimeType,
      qualityLabel: typeof candidate.quality_label === 'string'
        ? candidate.quality_label
        : typeof candidate.qualityLabel === 'string'
          ? candidate.qualityLabel
          : undefined,
      audioQuality: typeof candidate.audio_quality === 'string'
        ? candidate.audio_quality
        : undefined,
      bitrate: typeof candidate.bitrate === 'number' ? candidate.bitrate : Number(candidate.bitrate) || 0,
      height: typeof candidate.height === 'number' ? candidate.height : Number(candidate.height) || 0,
      itag: typeof candidate.itag === 'number' ? candidate.itag : Number(candidate.itag) || 0,
    });
  }
  return output;
}

/**
 * Try several InnerTube client profiles. A failure in any profile is
 * intentionally swallowed so the normal extractor chain remains untouched.
 */
export async function youtubeiFallbackFormats(videoId: string): Promise<PlayerFormat[]> {
  try {
    const yt = await Promise.race([
      getClient(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('youtubei.js initialization timeout')), FALLBACK_TIMEOUT_MS),
      ),
    ]);

    const clients = ['YTMUSIC_ANDROID', 'ANDROID', 'TV_EMBEDDED', 'IOS'] as const;
    for (const client of clients) {
      try {
        const info = await Promise.race([
          yt.getInfo(videoId, client),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('youtubei.js request timeout')), FALLBACK_TIMEOUT_MS),
          ),
        ]);
        const formats = toPlayerFormats(info);
        if (formats.length) return formats;
      } catch {
        // Try the next client profile.
      }
    }
  } catch {
    // Last-resort fallback must never break the existing extractor chain.
  }

  return [];
}
