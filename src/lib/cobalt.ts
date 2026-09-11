/**
 * Cobalt API client — the LAST-RESORT fallback for YouTube, tried only after
 * the Innertube clients, the Piped/Invidious mirrors, and the 9Convert farm
 * have all come up empty.
 */

import type { PlayerFormat } from './youtube-formats';
import {
  COBALT_MAX_PUBLIC_ATTEMPTS,
  discoverPublicCobaltApis,
  isPublicDiscoveryEnabled,
} from './cobalt-directory';

const COBALT_TIMEOUT_MS = 15_000;

export interface CobaltConfig {
  url: string;
  auth?: string;
}

export function cobaltConfigFromEnv(): CobaltConfig | null {
  const url = (process.env.COBALT_API_URL || '').trim().replace(/\/+$/, '');
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  } catch {
    return null;
  }
  const auth = (process.env.COBALT_API_AUTH || '').trim();
  return auth ? { url, auth } : { url };
}

export function isCobaltConfigured(): boolean {
  return cobaltConfigFromEnv() !== null || isPublicDiscoveryEnabled();
}

export function cobaltAuthHeader(auth: string): string {
  const trimmed = auth.trim();
  if (/^(Api-Key|Bearer)\s+\S/i.test(trimmed)) return trimmed;
  return `Bearer ${trimmed}`;
}

export interface CobaltResult {
  formats: PlayerFormat[];
  error?: string;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toFormat(url: string, kind: 'video' | 'audio', audioFormat: 'mp3' | 'opus' = 'mp3'): PlayerFormat {
  return kind === 'video'
    ? {
        url,
        mimeType: 'video/mp4',
        qualityLabel: undefined,
        audioQuality: 'AUDIO_QUALITY_MEDIUM',
        bitrate: 0,
        height: 0,
        itag: 0,
      }
    : {
        url,
        // Cobalt's supported converted audio formats are mp3/ogg/wav/opus.
        // We only ask it for MP3 or Opus, and never pretend that an Opus file
        // is an MP3 merely because the caller requested an audio download.
        mimeType: audioFormat === 'opus' ? 'audio/ogg' : 'audio/mpeg',
        audioQuality: 'AUDIO_QUALITY_MEDIUM',
        bitrate: 0,
        height: 0,
        itag: 0,
      };
}

export function cobaltErrorText(payload: Record<string, unknown>): string {
  const error = payload.error;
  if (error && typeof error === 'object') {
    const code = asString((error as Record<string, unknown>).code);
    if (code) return code;
  }
  return asString(payload.text) || asString(error) || 'cobalt refused the request';
}

export function interpretCobaltPayload(
  payload: Record<string, unknown>,
  kind: 'video' | 'audio',
  audioFormat: 'mp3' | 'opus' = 'mp3',
): CobaltResult {
  const status = asString(payload.status);

  if (status === 'error' || status === 'rate-limit') {
    return { formats: [], error: status === 'rate-limit' ? 'rate limited by cobalt' : cobaltErrorText(payload) };
  }

  // Current Cobalt instances can report a completed result as `redirect`,
  // `stream`, or `success`. Older instances use `tunnel`. All three result
  // shapes carry the finished media URL in `url`.
  if (status === 'redirect' || status === 'tunnel' || status === 'stream' || status === 'success') {
    const url = asString(payload.url);
    return url
      ? { formats: [toFormat(url, kind, audioFormat)] }
      : { formats: [], error: `${status} without a url` };
  }

  if (status === 'picker') {
    const items = Array.isArray(payload.picker) ? payload.picker : [];
    if (kind === 'audio') {
      const audioUrl = asString(payload.audio);
      if (audioUrl) return { formats: [toFormat(audioUrl, 'audio', audioFormat)] };
    }
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const entry = item as Record<string, unknown>;
      const type = asString(entry.type);
      if (type && type !== 'video' && type !== 'gif') continue;
      const url = asString(entry.url);
      if (url) return { formats: [toFormat(url, kind, audioFormat)] };
    }
    return { formats: [], error: 'picker had no usable video entry' };
  }

  if (status === 'local-processing') {
    return { formats: [], error: 'local-processing (this server cannot remux)' };
  }

  return { formats: [], error: status ? `unexpected status "${status}"` : 'malformed cobalt response' };
}

async function askInstance(
  origin: string,
  pageUrl: string,
  kind: 'video' | 'audio',
  auth?: string,
  audioFormat: 'mp3' | 'opus' = 'mp3',
): Promise<CobaltResult> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (compatible; YTConvert/1.0)',
  };
  if (auth) headers.Authorization = cobaltAuthHeader(auth);

  const body = {
    url: pageUrl,
    downloadMode: kind === 'audio' ? 'audio' : 'auto',
    audioFormat: kind === 'audio' ? audioFormat : 'mp3',
    videoQuality: '1080',
    filenameStyle: 'basic',
    localProcessing: 'disabled',
  };

  try {
    const response = await fetch(origin, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(COBALT_TIMEOUT_MS),
    });
    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!data) {
      return {
        formats: [],
        error: response.status === 429 ? 'rate limited (HTTP 429)' : `HTTP ${response.status}`,
      };
    }
    return interpretCobaltPayload(data, kind, audioFormat);
  } catch (err) {
    const message = (err as Error)?.name === 'TimeoutError' ? 'timed out' : 'unreachable';
    return { formats: [], error: message };
  }
}

export async function cobaltFormats(
  pageUrl: string,
  kind: 'video' | 'audio',
  audioFormat: 'mp3' | 'opus' = 'mp3',
): Promise<CobaltResult> {
  const errors: string[] = [];
  const config = cobaltConfigFromEnv();

  if (config) {
    const result = await askInstance(config.url, pageUrl, kind, config.auth, audioFormat);
    if (result.formats.length) return result;
    if (result.error) errors.push(`${hostOf(config.url)}: ${result.error}`);
    if (config.auth) return { formats: [], error: errors[0] };
  }

  if (!isPublicDiscoveryEnabled()) return { formats: [], error: errors[0] };

  const discovered = (await discoverPublicCobaltApis())
    .filter(origin => origin !== config?.url)
    .slice(0, COBALT_MAX_PUBLIC_ATTEMPTS);
  if (!discovered.length) return { formats: [], error: errors[0] };

  const attempts = await Promise.all(
    discovered.map(async origin => ({
      origin,
      result: await askInstance(origin, pageUrl, kind, undefined, audioFormat),
    })),
  );

  for (const { origin, result } of attempts) {
    if (result.formats.length) return result;
    if (result.error) errors.push(`${hostOf(origin)}: ${result.error}`);
  }

  return { formats: [], error: pickBestError(errors) };
}

function hostOf(origin: string): string {
  try {
    return new URL(origin).hostname;
  } catch {
    return 'cobalt';
  }
}

function pickBestError(errors: string[]): string | undefined {
  if (!errors.length) return undefined;
  return errors.find(e => e.includes('error.api.')) ?? errors[0];
}
