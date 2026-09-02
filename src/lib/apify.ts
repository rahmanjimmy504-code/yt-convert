// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Apify Actor fallback — the PAID, opt-in, absolute-last-resort YouTube
 * converter, tried only after the Innertube clients, the public mirrors,
 * the 9Convert farm, and cobalt have ALL come up empty.
 *
 * ── Why this fallback exists ─────────────────────────────────────────────
 * When YouTube bot-blocks this server's egress IP, every free source above
 * fails the same way, because they all extract from an IP YouTube has
 * decided not to trust. An Apify Actor runs yt-dlp inside Apify's
 * infrastructure on Apify's own proxies — i.e. on somebody else's egress —
 * which is the one thing this server cannot fake. That independence is
 * also exactly why it must stay the LAST resort: every run costs the
 * operator real, pre-paid credit.
 *
 * ── Configuration (optional; an unset APIFY_TOKEN disables everything) ──
 *   APIFY_TOKEN            Apify API token (Console → Settings → API & INTEGRATIONS)
 *   APIFY_ACTOR_ID         Actor to run, `username~actor-name` or the internal
 *                          ID. Default: marielise.dev~youtube-video-downloader
 *                          (yt-dlp based; format:"mp3" => audio-only MP3,
 *                          format:"default" => progressive MP4; it stores the
 *                          finished file in the run's key-value store and
 *                          returns a `downloadUrl` on api.apify.com).
 *   APIFY_MONTHLY_CAP_USD  Soft monthly spend stop in USD (default 8, 0 = off).
 *   APIFY_RUN_TIMEOUT_S    Per-run timeout in seconds, clamped to 30–300
 *                          (default 90). Bounds both the visitor's wait and,
 *                          on a pay-per-minute Actor, the per-run bill.
 *   APIFY_PROXY_HOSTS      Exact media hosts to trust beyond api.apify.com
 *                          (see ./media-hosts.ts; only needed if the Actor
 *                          ever hands files back from another host).
 *   APIFY_YOUTUBE_COOKIES  Optional Netscape-format cookies.txt of a
 *                          THROWAWAY logged-in YouTube account, bridged into
 *                          the Actor's `youtubeCookies` input so yt-dlp runs
 *                          signed-in (age gates, CDN throttling, some bot
 *                          walls). Never logged; only ever sent to
 *                          api.apify.com inside the HTTPS, Bearer-authenticated
 *                          run input.
 *
 * ── Spend guard (usage cap) ──────────────────────────────────────────────
 * Before EVERY run the provider asks Apify for the account's current
 * monthly usage (GET /v2/users/me/limits → data.current.monthlyUsageUsd)
 * and skips the run entirely once usage >= APIFY_MONTHLY_CAP_USD. The check
 * deliberately FAILS CLOSED: if the limits endpoint cannot be reached or
 * the payload is unreadable, no run is started — a visitor losing one
 * fallback is cheap, an overrun credit is not. The account's pre-paid free
 * credit (the operator adds no payment card) is the hard stop; this cap is
 * the extra soft stop that paces the credit across the month.
 *
 * ── Bounded cost per request ────────────────────────────────────────────
 * One request performs exactly ONE `run-sync-get-dataset-items` call, which
 * starts exactly one Actor run. There are no retries and no fan-out: a
 * failed run surfaces as "no result", the visitor sees the normal
 * "try a converter" message, and the operator can read the reason in the
 * server log. The run's `timeout` is passed to Apify so a single run (and
 * its per-minute bill) cannot grow without bound.
 *
 * ── SSRF boundary ───────────────────────────────────────────────────────
 * The Actor returns a `downloadUrl` on api.apify.com. That host — and
 * nothing wider — is added to the media-host allowlist while APIFY_TOKEN is
 * set (./media-hosts.ts, exact host only, never a suffix rule). extract.ts
 * re-checks every URL with isAllowedMediaUrl before it can reach the
 * convert proxy, and the proxy sniffs the first bytes of the response so an
 * HTML or JSON error body can never be saved as an .mp3/.mp4.
 */

import type { PlayerFormat } from './youtube-formats';

const APIFY_API_ORIGIN = 'https://api.apify.com';
const APIFY_API_BASE = `${APIFY_API_ORIGIN}/v2`;

/**
 * Default Actor: the yt-dlp based downloader that stores the finished file
 * in the run's key-value store and returns one dataset item per URL with a
 * `downloadUrl`, `status`, and (on failure) an `error` field.
 */
export const DEFAULT_APIFY_ACTOR_ID = 'marielise.dev~youtube-video-downloader';

/** Default soft monthly spend stop (USD). */
export const DEFAULT_APIFY_MONTHLY_CAP_USD = 8;

const DEFAULT_RUN_TIMEOUT_S = 90;
const MIN_RUN_TIMEOUT_S = 30;
const MAX_RUN_TIMEOUT_S = 300;

const LIMITS_TIMEOUT_MS = 6_000;
/** Wall-clock grace for the sync run call beyond the run timeout itself. */
const RUN_GRACE_MS = 15_000;

/** Hard cap on APIFY_YOUTUBE_COOKIES — a real cookies.txt is a few KB at most. */
export const MAX_COOKIES_FILE_CHARS = 65_536;

/**
 * The actor id becomes a URL path segment, so it must be a single path-safe
 * token: `username~actor-name`, or Apify's internal alphanumeric id. Path
 * metacharacters, spaces, and wildcards make the fallback disabled rather
 * than passed through.
 */
const ACTOR_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]*$/;

export interface ApifyConfig {
  /** Apify API token (a secret — never log it, never send it to the client). */
  token: string;
  /** Actor to run: `username~actor-name` or the internal actor ID. */
  actorId: string;
  /** Soft monthly spend stop in USD; 0 is the operator's "off" switch. */
  monthlyCapUsd: number;
  /** Bounded run timeout in seconds, clamped to 30–300. */
  runTimeoutS: number;
  /**
   * Operator's Netscape-format cookies.txt for a throwaway YouTube account
   * (APIFY_YOUTUBE_COOKIES). Bridged verbatim into the Actor's
   * `youtubeCookies` input so yt-dlp runs signed-in. A secret — never logged,
   * never sent anywhere but api.apify.com, never returned to the browser.
   */
  youtubeCookies?: string;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Parse APIFY_MONTHLY_CAP_USD. An empty value keeps the default; a negative
 * or non-numeric value also falls back to the default (rather than silently
 * disabling the fallback or unbounding it); 0 is honoured as "never run".
 */
export function parseMonthlyCapUsd(raw: string | undefined): number {
  const trimmed = (raw || '').trim();
  if (!trimmed) return DEFAULT_APIFY_MONTHLY_CAP_USD;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return DEFAULT_APIFY_MONTHLY_CAP_USD;
  return value;
}

/** Parse APIFY_RUN_TIMEOUT_S, clamped to the sync endpoint's 30–300 s range. */
export function parseRunTimeoutS(raw: string | undefined): number {
  const trimmed = (raw || '').trim();
  if (!trimmed) return DEFAULT_RUN_TIMEOUT_S;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_RUN_TIMEOUT_S;
  return Math.min(MAX_RUN_TIMEOUT_S, Math.max(MIN_RUN_TIMEOUT_S, Math.round(value)));
}

/**
 * Validate an operator-supplied Netscape cookies.txt file
 * (APIFY_YOUTUBE_COOKIES). Returns the normalized content, or null when the
 * value is empty or does not look like a cookies.txt file at all — in which
 * case the fallback runs WITHOUT cookies rather than feeding the Actor junk.
 *
 * Unlike the Innertube Cookie header (see sanitizeYouTubeCookies in
 * ./extract.ts) this content travels inside the JSON run body, not an HTTP
 * header, so newlines and tabs are legitimate Netscape-format separators and
 * are preserved. Everything else is strict:
 *
 *   - CRLF is normalized to LF (Windows exports);
 *   - any other control character (NUL, ESC, a lone CR, DEL) means the paste
 *     is corrupted or hostile and rejects the whole file;
 *   - a hard 64 KiB size cap (a real cookies.txt is a few KB);
 *   - at least one data line with the tab-separated Netscape shape must be
 *     present. A pasted `NAME=value; NAME2=value2` browser header is NOT
 *     accepted: yt-dlp would drop every line and run anonymously while the
 *     operator believes they are signed in — silent breakage we refuse to
 *     paper over.
 */
export function sanitizeNetscapeCookieFile(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const normalized = raw.replace(/\r\n/g, '\n');
  if (!normalized.trim()) return null;
  if (normalized.length > MAX_COOKIES_FILE_CHARS) return null;
  // Allow only \t (field separator) and \n (line separator); reject NUL, ESC,
  // a lone \r (any \r that survived CRLF normalization is corrupt), DEL and
  // every other C0 control.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000B-\u001F\u007F]/.test(normalized)) return null;
  const hasNetscapeDataLine = normalized.split('\n').some(line => {
    const trimmedLine = line.trim();
    return trimmedLine !== '' && !trimmedLine.startsWith('#') && line.includes('\t');
  });
  return hasNetscapeDataLine ? normalized : null;
}

/**
 * Read the Apify configuration from the environment. Returns null when no
 * token is set (or the actor id is unusable), which disables the fallback.
 */
export function apifyConfigFromEnv(): ApifyConfig | null {
  const token = (process.env.APIFY_TOKEN || '').trim();
  if (!token) return null;
  const actorId = (process.env.APIFY_ACTOR_ID || '').trim() || DEFAULT_APIFY_ACTOR_ID;
  if (!ACTOR_ID_PATTERN.test(actorId)) {
    console.warn(
      '[apify] APIFY_ACTOR_ID is not a plain username~name or actor id; the fallback is disabled',
    );
    return null;
  }
  // Optional cookies bridge: an unusable value never disables the fallback,
  // it only runs it unsigned-in (with one operator-facing warning). The key
  // is omitted entirely when unset so the config shape is unchanged for
  // deployments that do not use the bridge.
  const rawCookies = process.env.APIFY_YOUTUBE_COOKIES || '';
  let youtubeCookies: string | undefined;
  if (rawCookies.trim()) {
    youtubeCookies = sanitizeNetscapeCookieFile(rawCookies) ?? undefined;
    if (!youtubeCookies) {
      console.warn(
        '[apify] APIFY_YOUTUBE_COOKIES is set but is not a Netscape cookies.txt file; running without cookies',
      );
    }
  }
  return {
    token,
    actorId,
    monthlyCapUsd: parseMonthlyCapUsd(process.env.APIFY_MONTHLY_CAP_USD),
    runTimeoutS: parseRunTimeoutS(process.env.APIFY_RUN_TIMEOUT_S),
    ...(youtubeCookies ? { youtubeCookies } : {}),
  };
}

/** True when the Apify fallback is configured and can run at all. */
export function isApifyConfigured(): boolean {
  return apifyConfigFromEnv() !== null;
}

/**
 * Map the app's video quality options onto the Actor's accepted values
 * ("360" | "480" | "720" | "1080" — a ceiling, not a floor). The app's
 * "best" and anything unrecognized map to "1080", the Actor's own maximum
 * and default.
 */
export function apifyVideoQuality(quality?: string): '360' | '480' | '720' | '1080' {
  switch ((quality || '').trim()) {
    case '360':
      return '360';
    case '480':
      return '480';
    case '720':
      return '720';
    case '1080':
      return '1080';
    default:
      return '1080';
  }
}

/** The Actor input, exactly as its input schema describes it. */
export interface ApifyActorInput {
  /** One object per video; this app always converts exactly one URL. */
  urls: Array<{ url: string }>;
  /** "mp3" => audio-only extraction, "default" => progressive MP4. */
  format: 'mp3' | 'default';
  /** Maximum video resolution; ignored by the Actor for MP3. */
  quality?: '360' | '480' | '720' | '1080';
  /**
   * Netscape-format cookies.txt content (APIFY_YOUTUBE_COOKIES), bridged
   * verbatim into the Actor's optional `youtubeCookies` field so yt-dlp runs
   * under a signed-in session. Omitted entirely when unconfigured, so the
   * run input for cookie-less deployments is byte-identical to before.
   */
  youtubeCookies?: string;
}

/**
 * Build the Actor input for one page URL. `want` follows the same meaning as
 * the cobalt client ('audio' | 'video'). The quality field is only sent for
 * video requests — the Actor ignores it for MP3 and the MP3 bitrate is
 * whatever yt-dlp/ffmpeg produces. `youtubeCookies` is the operator's
 * pre-validated cookies.txt (see sanitizeNetscapeCookieFile) and is attached
 * unchanged when present.
 */
export function buildActorInput(
  pageUrl: string,
  want: 'audio' | 'video',
  quality?: string,
  youtubeCookies?: string,
): ApifyActorInput {
  const input: ApifyActorInput = {
    urls: [{ url: pageUrl }],
    format: want === 'audio' ? 'mp3' : 'default',
  };
  if (want === 'video') input.quality = apifyVideoQuality(quality);
  if (youtubeCookies) input.youtubeCookies = youtubeCookies;
  return input;
}

/** A usable download picked out of the Actor's dataset output. */
export interface ApifyDownload {
  url: string;
  /** Display label like "1080p" when the Actor reports one. */
  qualityLabel?: string;
}

/**
 * Parse the dataset items returned by run-sync-get-dataset-items. Each
 * successful video yields one record shaped like:
 *
 *   { status: "success", downloadUrl: "https://api.apify.com/v2/…",
 *     quality: "1080p", title, fileSizeBytes, contentType, … }
 *
 * and each failure one shaped like `{ status: "failed", error: "…" }`.
 * The first item with a usable HTTPS `downloadUrl` wins; otherwise the most
 * useful failure reason is returned. `download_url` (snake_case) is also
 * accepted so a schema tweak on the Actor's side cannot silently produce
 * "no downloadable file" for a run that actually succeeded.
 */
export function pickDownloadUrl(items: unknown): ApifyDownload | { error: string } {
  if (!Array.isArray(items)) {
    // A 2xx body that is not a list: usually an error object in disguise.
    const detail = items && typeof items === 'object' ? apifyErrorText(items) : '';
    return { error: detail || 'the Actor response was not a dataset list' };
  }
  if (items.length === 0) return { error: 'the Actor returned no dataset items' };

  const failures: string[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    const status = asString(entry.status).toLowerCase();
    // Accept both documented spellings of the failure status.
    if (status === 'failed' || status === 'error') {
      failures.push(asString(entry.error) || 'the Actor marked this URL as failed');
      continue;
    }
    const url = asString(entry.downloadUrl) || asString(entry.download_url);
    if (url && /^https:\/\//i.test(url)) {
      const rawQuality = asString(entry.quality);
      return {
        url,
        qualityLabel: /^\d{3,4}p$/.test(rawQuality) ? rawQuality : undefined,
      };
    }
    if (status === 'success') failures.push('status "success" without a downloadUrl');
  }
  return { error: failures[0] || 'no downloadable file in the Actor output' };
}

/**
 * Extract `data.current.monthlyUsageUsd` from a GET /v2/users/me/limits
 * payload. Returns null for anything else, which the caller treats as
 * "cannot prove we are under the cap" and therefore skips the run.
 */
export function monthlyUsageUsdFromLimits(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = (payload as Record<string, unknown>).data;
  if (!data || typeof data !== 'object') return null;
  const current = (data as Record<string, unknown>).current;
  if (!current || typeof current !== 'object') return null;
  const used = (current as Record<string, unknown>).monthlyUsageUsd;
  if (typeof used !== 'number' || !Number.isFinite(used) || used < 0) return null;
  return used;
}

/**
 * Pull a readable message out of an Apify error body, which is shaped
 * `{ error: { type: "…", message: "…" } }`.
 */
export function apifyErrorText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const error = (payload as Record<string, unknown>).error;
  if (error && typeof error === 'object') {
    const entry = error as Record<string, unknown>;
    return asString(entry.message) || asString(entry.type);
  }
  return asString(error);
}

/**
 * Append the API token to an api.apify.com record URL so the convert proxy
 * can fetch the file even when the account's storages are not publicly
 * readable. Pre-signed record URLs (a `signature` query parameter) keep
 * working untouched, and a URL that already carries a token is left alone.
 * URLs on any other host are returned unchanged: the token must never be
 * sent anywhere but api.apify.com.
 *
 * The token only ever travels server-side — /api/convert streams the bytes
 * through this app and never exposes the media URL (or this parameter) to
 * the browser.
 */
export function attachApifyToken(rawUrl: string, token: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname.toLowerCase() !== 'api.apify.com') return rawUrl;
    if (parsed.searchParams.has('token') || parsed.searchParams.has('signature')) return rawUrl;
    parsed.searchParams.set('token', token);
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * Wrap the single finished file in one PlayerFormat, mirroring the cobalt
 * client. Height and bitrate stay 0 so the picker accepts it for any
 * requested quality — the Actor has already applied the requested ceiling
 * itself, so there is nothing left to select between.
 */
function toFormat(url: string, kind: 'audio' | 'video', qualityLabel?: string): PlayerFormat {
  return kind === 'video'
    ? {
        url,
        mimeType: 'video/mp4',
        qualityLabel,
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

type UsageCheck = { ok: true; usedUsd: number } | { ok: false; reason: string };

/** Ask Apify for this month's usage so far. Never throws. */
async function fetchMonthlyUsageUsd(token: string): Promise<UsageCheck> {
  try {
    const response = await fetch(`${APIFY_API_BASE}/users/me/limits`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'Mozilla/5.0 (compatible; YTConvert/1.0)',
      },
      signal: AbortSignal.timeout(LIMITS_TIMEOUT_MS),
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { ok: false, reason: `limits HTTP ${response.status} — check APIFY_TOKEN` };
      }
      // A rate limit is not a refusal; an operator reading logs should be
      // able to tell them apart (same convention as the cobalt client).
      if (response.status === 429) {
        return { ok: false, reason: 'limits rate limited (HTTP 429)' };
      }
      return { ok: false, reason: `limits HTTP ${response.status}` };
    }
    const payload = await response.json().catch(() => null);
    const usedUsd = monthlyUsageUsdFromLimits(payload);
    if (usedUsd === null) {
      return { ok: false, reason: 'limits payload had no data.current.monthlyUsageUsd' };
    }
    return { ok: true, usedUsd };
  } catch (err) {
    const timedOut = (err as Error)?.name === 'TimeoutError';
    return { ok: false, reason: timedOut ? 'limits request timed out' : 'limits endpoint unreachable' };
  }
}

/**
 * Run the Actor exactly once, synchronously, and return the run's dataset
 * items. `run-sync-get-dataset-items` starts one run, waits for it (up to
 * the run `timeout` given in seconds), and answers with a bare JSON array
 * of dataset items. Never throws; every failure is an error string.
 */
async function runActorOnce(
  config: ApifyConfig,
  pageUrl: string,
  want: 'audio' | 'video',
  quality?: string,
): Promise<{ items?: unknown; error?: string }> {
  // The actor id is validated by apifyConfigFromEnv() to contain only
  // path-safe characters, so it can be interpolated directly.
  const url =
    `${APIFY_API_BASE}/acts/${config.actorId}/run-sync-get-dataset-items?timeout=${config.runTimeoutS}`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.token}`,
        'User-Agent': 'Mozilla/5.0 (compatible; YTConvert/1.0)',
      },
      body: JSON.stringify(buildActorInput(pageUrl, want, quality, config.youtubeCookies)),
      // Give Apify time to answer its own 408 before we cut the call.
      signal: AbortSignal.timeout(config.runTimeoutS * 1000 + RUN_GRACE_MS),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const detail = payload ? apifyErrorText(payload) : '';
      const suffix = detail ? `: ${detail}` : '';
      if (response.status === 401 || response.status === 403) {
        return { error: `HTTP ${response.status} — check APIFY_TOKEN${suffix}` };
      }
      if (response.status === 404) {
        return { error: `HTTP 404 — actor not found, check APIFY_ACTOR_ID${suffix}` };
      }
      if (response.status === 429) {
        return { error: `rate limited (HTTP 429)${suffix}` };
      }
      if (response.status === 408) {
        return { error: `run did not finish within ${config.runTimeoutS}s (HTTP 408)${suffix}` };
      }
      return { error: `HTTP ${response.status}${suffix}` };
    }
    const items = await response.json().catch(() => null);
    if (items === null) return { error: 'run response was not valid JSON' };
    return { items };
  } catch (err) {
    const timedOut = (err as Error)?.name === 'TimeoutError';
    return { error: timedOut ? 'the run timed out' : 'api.apify.com was unreachable' };
  }
}

export interface ApifyResult {
  formats: PlayerFormat[];
  /** Diagnostics for the operator's server log; never shown to visitors verbatim. */
  error?: string;
}

/**
 * The last-resort conversion: check the monthly spend cap, then run the
 * Actor exactly once and wrap the finished file for the format picker.
 *
 * Every failure mode — cap reached, usage check failed, Actor refused,
 * unreachable — returns an empty format list plus a reason, so the caller
 * can fall through to its honest "try a converter" message.
 */
export async function apifyFormats(
  pageUrl: string,
  want: 'audio' | 'video',
  quality?: string,
): Promise<ApifyResult> {
  const config = apifyConfigFromEnv();
  if (!config) return { formats: [] };

  // 0 is the operator's off switch: never spend, and do not even ask.
  if (config.monthlyCapUsd <= 0) {
    return { formats: [], error: 'APIFY_MONTHLY_CAP_USD is 0 — the Apify fallback is disabled' };
  }

  // Spend guard: one limits call before every run, failing closed.
  const usage = await fetchMonthlyUsageUsd(config.token);
  if (!usage.ok) {
    return { formats: [], error: `usage check failed (${usage.reason}) — no run started` };
  }
  if (usage.usedUsd >= config.monthlyCapUsd) {
    return {
      formats: [],
      error:
        `monthly usage $${usage.usedUsd.toFixed(2)} has reached the ` +
        `$${config.monthlyCapUsd.toFixed(2)} cap — no run started`,
    };
  }

  const run = await runActorOnce(config, pageUrl, want, quality);
  if (run.error) return { formats: [], error: run.error };

  const picked = pickDownloadUrl(run.items);
  if ('error' in picked) return { formats: [], error: picked.error };

  return {
    formats: [toFormat(attachApifyToken(picked.url, config.token), want, picked.qualityLabel)],
  };
}
