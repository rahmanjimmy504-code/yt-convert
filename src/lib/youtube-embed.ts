/**
 * YouTube iframe HTML fallback.
 *
 * The embed page sometimes contains a direct ytInitialPlayerResponse even
 * when mobile Innertube clients are bot-walled. This is still first-party
 * YouTube extraction (and googlevideo links remain IP-bound), but it is a
 * useful independent player surface. Both youtube.com and youtube-nocookie
 * variants are raced; cipher-only entries are intentionally ignored.
 *
 * Server-only: youtubeAwareFetch may use the operator's YT_EGRESS_PROXY.
 */

import { isAllowedMediaUrl } from './media-hosts';
import { youtubeAwareFetch } from './youtube-egress';
import type { PlayerFormat } from './youtube-formats';

const EMBED_TIMEOUT_MS = 8_000;
const EMBED_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';

export const YOUTUBE_EMBED_BASES = [
  'https://www.youtube.com',
  'https://www.youtube-nocookie.com',
] as const;

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

/** Read one balanced JSON object while respecting quoted braces. */
function balancedObject(source: string, start: number): string {
  const opening = source.indexOf('{', start);
  if (opening < 0) return '';
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let i = opening; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(opening, i + 1);
    }
  }
  return '';
}

function jsonStringAfterKey(source: string, key: string): string {
  const index = source.indexOf(`"${key}"`);
  if (index < 0) return '';
  const colon = source.indexOf(':', index + key.length + 2);
  if (colon < 0) return '';
  const opening = source.indexOf('"', colon + 1);
  if (opening < 0) return '';
  let escaped = false;
  for (let i = opening + 1; i < source.length; i += 1) {
    const char = source[i];
    if (escaped) escaped = false;
    else if (char === '\\') escaped = true;
    else if (char === '"') {
      try {
        return JSON.parse(source.slice(opening, i + 1)) as string;
      } catch {
        return '';
      }
    }
  }
  return '';
}

export function parseEmbedPlayerResponse(html: string): JsonRecord | null {
  const markers = ['ytInitialPlayerResponse =', 'ytInitialPlayerResponse=', 'ytInitialPlayerResponse\\x3d'];
  for (const marker of markers) {
    const index = html.indexOf(marker);
    if (index < 0) continue;
    const raw = balancedObject(html, index + marker.length);
    if (!raw) continue;
    try {
      const parsed = record(JSON.parse(raw));
      if (parsed) return parsed;
    } catch {
      // Try the next representation.
    }
  }

  // Older embed configs put the whole response in args.player_response as an
  // escaped JSON string.
  const escaped = jsonStringAfterKey(html, 'player_response');
  if (escaped) {
    try {
      return record(JSON.parse(escaped));
    } catch {
      return null;
    }
  }
  return null;
}

export function formatsFromEmbedPlayerResponse(payload: JsonRecord): PlayerFormat[] {
  const streaming = record(payload.streamingData);
  const formats = [
    ...(Array.isArray(streaming?.formats) ? streaming.formats : []),
    ...(Array.isArray(streaming?.adaptiveFormats) ? streaming.adaptiveFormats : []),
  ];
  return formats
    .map(raw => record(raw) as PlayerFormat | null)
    .filter((format): format is PlayerFormat => {
      if (!format || typeof format.url !== 'string') return false;
      return isAllowedMediaUrl(format.url);
    });
}

async function formatsFromEmbedBase(base: string, videoId: string): Promise<PlayerFormat[]> {
  try {
    const response = await youtubeAwareFetch(
      `${base}/embed/${encodeURIComponent(videoId)}?hl=en&playsinline=1`,
      {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          Referer: 'https://www.reddit.com/',
          'User-Agent': EMBED_UA,
        },
        signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
      },
    );
    if (!response.ok) return [];
    const payload = parseEmbedPlayerResponse(await response.text());
    return payload ? formatsFromEmbedPlayerResponse(payload) : [];
  } catch {
    return [];
  }
}

export async function youtubeEmbedFormats(videoId: string): Promise<PlayerFormat[]> {
  const results = await Promise.all(
    YOUTUBE_EMBED_BASES.map(base => formatsFromEmbedBase(base, videoId)),
  );
  return results.find(formats => formats.length > 0) || [];
}
