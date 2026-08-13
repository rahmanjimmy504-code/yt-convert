/**
 * Cobalt API client — the LAST-RESORT fallback for YouTube, tried only after
 * the Innertube clients, Invidious, and Piped have all come up empty.
 *
 * Endpoint discovery (verified against the official API docs and a live
 * probe of api.cobalt.tools running v11.7.1):
 *   - Cobalt v10 removed the old `POST /api/json` path (shut down Nov 2024).
 *     Requests to it now 404, so any client still using it is dead code.
 *   - The v11 processing endpoint is `POST /` on the INSTANCE ROOT, with both
 *     `Accept: application/json` and `Content-Type: application/json`
 *     required. `GET /` returns instance info (version, supported services).
 *
 * IMPORTANT CAVEAT: the official `api.cobalt.tools` instance is blocked from
 * YouTube (it returns a refusal for youtube URLs) and its bot protection
 * makes it off-limits to third-party apps anyway — the cobalt docs tell
 * operators to host their own instance. So this fallback is a no-op until an
 * operator points COBALT_API_URL at an instance they run. That is deliberate:
 * it costs one failed request and never silently degrades the main path.
 *
 * Every URL cobalt hands back is re-validated against the media-host
 * allowlist (./media-hosts.ts) before it can reach the convert proxy, so a
 * hostile or misconfigured instance cannot turn this into an SSRF vector.
 */

import type { PlayerFormat } from './youtube-formats';

const COBALT_TIMEOUT_MS = 15_000;

export interface CobaltConfig {
  url: string;
  auth?: string;
}

/**
 * Read the cobalt configuration from the environment. Returns null when no
 * instance is configured, which disables the fallback entirely.
 */
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

/** True when a cobalt instance is configured. */
export function isCobaltConfigured(): boolean {
  return cobaltConfigFromEnv() !== null;
}

/**
 * Build the Authorization header value. Cobalt accepts two schemes,
 * `Api-Key <token>` and `Bearer <token>`. An operator may supply either the
 * bare token (defaults to Bearer) or the full "Scheme token" string.
 */
export function cobaltAuthHeader(auth: string): string {
  const trimmed = auth.trim();
  if (/^(Api-Key|Bearer)\s+\S/i.test(trimmed)) return trimmed;
  return `Bearer ${trimmed}`;
}

export interface CobaltResult {
  formats: PlayerFormat[];
  /** Set when cobalt explicitly refused, for an honest user-facing message. */
  error?: string;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Cobalt returns a finished, muxed file rather than a format list, so we wrap
 * the single URL in one PlayerFormat that satisfies the picker. Video results
 * are muxed mp4 (video+audio), audio results are mp3.
 */
function toFormat(url: string, kind: 'video' | 'audio'): PlayerFormat {
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
        mimeType: 'audio/mpeg',
        audioQuality: 'AUDIO_QUALITY_MEDIUM',
        bitrate: 0,
        height: 0,
        itag: 0,
      };
}

/**
 * Turn a cobalt error payload into a readable string. v11 nests the code
 * under `error.code` (e.g. "error.api.youtube.login"); older/edge responses
 * sometimes use a bare `text` field.
 */
export function cobaltErrorText(payload: Record<string, unknown>): string {
  const error = payload.error;
  if (error && typeof error === 'object') {
    const code = asString((error as Record<string, unknown>).code);
    if (code) return code;
  }
  return asString(payload.text) || asString(error) || 'cobalt refused the request';
}

/**
 * Ask a cobalt instance for a downloadable file.
 *
 * Handles every documented v11 status:
 *   - `redirect` / `tunnel`  -> a single usable URL
 *   - `picker`               -> pick the first video entry
 *   - `local-processing`     -> needs client-side remuxing, which we cannot
 *                               do in the proxy, so it is reported, not used
 *   - `error`                -> surfaced with its code
 */
export async function cobaltFormats(
  pageUrl: string,
  kind: 'video' | 'audio',
): Promise<CobaltResult> {
  const config = cobaltConfigFromEnv();
  if (!config) return { formats: [] };

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (compatible; YTConvert/1.0)',
  };
  if (config.auth) headers.Authorization = cobaltAuthHeader(config.auth);

  const body = {
    url: pageUrl,
    // `audio` strips the video track and transcodes to audioFormat; `auto`
    // returns a muxed file. Both avoid the separate-track problem that the
    // Innertube path has to solve itself.
    downloadMode: kind === 'audio' ? 'audio' : 'auto',
    audioFormat: 'mp3',
    videoQuality: '1080',
    filenameStyle: 'basic',
    // Keep processing server-side: we stream the result through the convert
    // proxy and cannot remux locally.
    localProcessing: 'disabled',
  };

  let payload: Record<string, unknown>;
  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(COBALT_TIMEOUT_MS),
    });
    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!data) {
      return { formats: [], error: `cobalt returned HTTP ${response.status}` };
    }
    payload = data;
  } catch {
    return { formats: [] };
  }

  const status = asString(payload.status);

  if (status === 'error') {
    return { formats: [], error: cobaltErrorText(payload) };
  }

  if (status === 'redirect' || status === 'tunnel') {
    const url = asString(payload.url);
    return url ? { formats: [toFormat(url, kind)] } : { formats: [] };
  }

  if (status === 'picker') {
    const items = Array.isArray(payload.picker) ? payload.picker : [];
    // For an audio request prefer the dedicated audio track when present.
    if (kind === 'audio') {
      const audioUrl = asString(payload.audio);
      if (audioUrl) return { formats: [toFormat(audioUrl, 'audio')] };
    }
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const entry = item as Record<string, unknown>;
      const type = asString(entry.type);
      if (type && type !== 'video' && type !== 'gif') continue;
      const url = asString(entry.url);
      if (url) return { formats: [toFormat(url, kind)] };
    }
    return { formats: [] };
  }

  if (status === 'local-processing') {
    // The output would need to be remuxed/merged by the client; the convert
    // proxy streams bytes straight through and cannot do that.
    return {
      formats: [],
      error: 'cobalt returned a local-processing job, which this server cannot remux',
    };
  }

  return { formats: [] };
}
