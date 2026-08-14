/**
 * Cobalt API client — the LAST-RESORT fallback for YouTube, tried only after
 * the Innertube clients, the Piped/Invidious mirrors, and the 9Convert farm
 * have all come up empty.
 *
 * Endpoint shape (verified against the official v11 API docs):
 *   - Cobalt v10 removed the old `POST /api/json` path. The v11 processing
 *     endpoint is `POST /` on the INSTANCE ROOT, with both
 *     `Accept: application/json` and `Content-Type: application/json`.
 *   - `GET /` returns instance info (version, services, turnstileSitekey).
 *
 * ── Why this fallback exists ─────────────────────────────────────────────
 * When YouTube bot-blocks this server's egress IP ("Sign in to confirm
 * you're not a bot"), no amount of retrying Innertube from the same IP can
 * help. Cobalt runs on somebody else's egress, so it is genuinely
 * independent — which is the only kind of fallback worth having here.
 *
 * ── Candidate order ──────────────────────────────────────────────────────
 *   1. COBALT_API_URL, the operator's own instance. Always tried first, and
 *      when it is configured WITH authentication we never spill the URL to
 *      public instances: an operator who paid for a private instance should
 *      not have their traffic silently fan out to strangers.
 *   2. Reviewed public instances that cobalt.directory currently reports as
 *      passing its YouTube test (see ./cobalt-directory.ts for the trust
 *      model). At most COBALT_MAX_PUBLIC_ATTEMPTS of them, concurrently.
 *      Opt out entirely with COBALT_PUBLIC_DISCOVERY=0.
 *
 * ── Honest limitation ────────────────────────────────────────────────────
 * Every public instance currently passing the directory's YouTube test also
 * advertises a `turnstileSitekey`, i.e. it issues Bearer tokens only to
 * clients that solved a Cloudflare Turnstile challenge in a browser. A
 * server-to-server call therefore usually comes back
 * `error.api.auth.turnstile.missing`. We keep trying them because the check
 * costs one bounded request and instance policy changes often, but the code
 * does NOT pretend to solve challenges and never will. The real fix for an
 * operator is COBALT_API_URL pointing at an instance they run.
 *
 * Every URL cobalt hands back is re-validated against the media-host
 * allowlist (./media-hosts.ts) before it can reach the convert proxy, so a
 * hostile or misconfigured instance cannot turn this into an SSRF vector.
 */

import type { PlayerFormat } from './youtube-formats';
import {
  COBALT_MAX_PUBLIC_ATTEMPTS,
  discoverPublicCobaltApis,
  isPublicDiscoveryEnabled,
} from './cobalt-directory';

/** Per-instance budget. Bounded so a hung instance can't eat the request. */
const COBALT_TIMEOUT_MS = 15_000;

export interface CobaltConfig {
  url: string;
  auth?: string;
}

/**
 * Read the cobalt configuration from the environment. Returns null when no
 * instance is configured, which disables the private path (public discovery
 * may still run).
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

/**
 * True when the cobalt fallback can do anything at all: either the operator
 * configured an instance, or public discovery is enabled.
 */
export function isCobaltConfigured(): boolean {
  return cobaltConfigFromEnv() !== null || isPublicDiscoveryEnabled();
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
 * Interpret one v11 response body. Split out from the transport so every
 * documented status is unit-testable without a network stub.
 *
 * Statuses handled:
 *   - `tunnel` / `redirect` -> a single usable URL
 *   - `picker`              -> the audio track (audio requests) or first
 *                              video/gif entry
 *   - `local-processing`    -> needs client-side remuxing, which the byte
 *                              proxy cannot do, so it is reported, not used
 *   - `error`               -> surfaced with its code, for diagnostics
 */
export function interpretCobaltPayload(
  payload: Record<string, unknown>,
  kind: 'video' | 'audio',
): CobaltResult {
  const status = asString(payload.status);

  if (status === 'error') {
    return { formats: [], error: cobaltErrorText(payload) };
  }

  if (status === 'redirect' || status === 'tunnel') {
    const url = asString(payload.url);
    return url ? { formats: [toFormat(url, kind)] } : { formats: [], error: `${status} without a url` };
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
      // Skip photos: a slideshow image is not a usable mp3/mp4 result.
      if (type && type !== 'video' && type !== 'gif') continue;
      const url = asString(entry.url);
      if (url) return { formats: [toFormat(url, kind)] };
    }
    return { formats: [], error: 'picker had no usable video entry' };
  }

  if (status === 'local-processing') {
    // The output would need to be remuxed/merged by the client; the convert
    // proxy streams bytes straight through and cannot do that.
    return {
      formats: [],
      error: 'local-processing (this server cannot remux)',
    };
  }

  return { formats: [], error: status ? `unexpected status "${status}"` : 'malformed cobalt response' };
}

/** Ask ONE cobalt instance. Never throws; a transport failure is an error string. */
async function askInstance(
  origin: string,
  pageUrl: string,
  kind: 'video' | 'audio',
  auth?: string,
): Promise<CobaltResult> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (compatible; YTConvert/1.0)',
  };
  if (auth) headers.Authorization = cobaltAuthHeader(auth);

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

  try {
    const response = await fetch(origin, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(COBALT_TIMEOUT_MS),
    });
    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!data) {
      // 429 deserves its own note: it is a rate limit, not a refusal, and an
      // operator reading logs should be able to tell them apart.
      return {
        formats: [],
        error: response.status === 429 ? 'rate limited (HTTP 429)' : `HTTP ${response.status}`,
      };
    }
    return interpretCobaltPayload(data, kind);
  } catch (err) {
    const message = (err as Error)?.name === 'TimeoutError' ? 'timed out' : 'unreachable';
    return { formats: [], error: message };
  }
}

/**
 * Ask cobalt for a downloadable file, trying the private instance first and
 * then a bounded set of reviewed public instances.
 *
 * The public instances are raced concurrently (not serially) so that three
 * candidates cost one 15 s budget rather than 45 s; the first one returning a
 * usable URL wins. If none succeed, the most useful error code is kept for
 * diagnostics.
 */
export async function cobaltFormats(
  pageUrl: string,
  kind: 'video' | 'audio',
): Promise<CobaltResult> {
  const errors: string[] = [];
  const config = cobaltConfigFromEnv();

  // 1. The operator's own instance.
  if (config) {
    const result = await askInstance(config.url, pageUrl, kind, config.auth);
    if (result.formats.length) return result;
    if (result.error) errors.push(`${hostOf(config.url)}: ${result.error}`);

    // Do not leak the requested URL to third parties when the operator has
    // configured an authenticated private instance — that is a deliberate
    // privacy boundary, not an oversight.
    if (config.auth) return { formats: [], error: errors[0] };
  }

  // 2. Reviewed public instances the directory reports as YouTube-healthy.
  if (!isPublicDiscoveryEnabled()) {
    return { formats: [], error: errors[0] };
  }

  const discovered = (await discoverPublicCobaltApis())
    .filter(origin => origin !== config?.url)
    .slice(0, COBALT_MAX_PUBLIC_ATTEMPTS);

  if (!discovered.length) return { formats: [], error: errors[0] };

  const attempts = await Promise.all(
    discovered.map(async origin => ({ origin, result: await askInstance(origin, pageUrl, kind) })),
  );

  for (const { origin, result } of attempts) {
    if (result.formats.length) return result;
    if (result.error) errors.push(`${hostOf(origin)}: ${result.error}`);
  }

  // Keep the most informative code for the operator; the user-facing layer
  // never renders this verbatim.
  return { formats: [], error: pickBestError(errors) };
}

function hostOf(origin: string): string {
  try {
    return new URL(origin).hostname;
  } catch {
    return 'cobalt';
  }
}

/**
 * Prefer a real cobalt error code over a bare transport failure: knowing an
 * instance said `error.api.youtube.login` is far more actionable than knowing
 * a different one was unreachable.
 */
function pickBestError(errors: string[]): string | undefined {
  if (!errors.length) return undefined;
  return errors.find(e => e.includes('error.api.')) ?? errors[0];
}
