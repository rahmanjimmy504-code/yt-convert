import { type FormatKey, type PlatformKey, extractYouTubeId } from './platforms';
import {
  INVIDIOUS_INSTANCES,
  invidiousLatestVersionFormats,
  invidiousVideoUrl,
} from './invidious';
import { pipedFormats } from './piped';
import { nineConvertFormats } from './nineconvert';
import { youtubeEmbedFormats } from './youtube-embed';
import { cobaltFormats, isCobaltConfigured } from './cobalt';
import { getPoToken, isPoTokenServerConfigured } from './po-token';
import { isAllowedMediaUrl } from './media-hosts';
import { youtubeAwareFetch } from './youtube-egress';
import {
  extensionForMime,
  pickYouTubeFormat,
  isProgressiveMp4Itag,
  type PlayerFormat,
} from './youtube-formats';

export interface ExtractedMedia {
  url: string;
  mimeType: string;
  extension: string;
  qualityLabel?: string;
  /** TikTok: true when the official play URL still has a watermark. */
  watermarked?: boolean;
  note?: string;
}

export type ExtractResult = ExtractedMedia | { error: string };

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const PLAYER_TIMEOUT_MS = 12_000;
const PAGE_TIMEOUT_MS = 8_000;

function fail(error: string): ExtractResult {
  return { error };
}

function ok(media: ExtractedMedia): ExtractResult {
  if (!isAllowedMediaUrl(media.url)) {
    return fail('Extractor returned a host we will not proxy.');
  }
  return media;
}

async function fetchText(url: string, headers: Record<string, string>, timeout = PAGE_TIMEOUT_MS): Promise<string> {
  const response = await fetch(url, {
    headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/json;q=0.9,*/*;q=0.8', ...headers },
    signal: AbortSignal.timeout(timeout),
    redirect: 'follow',
  });
  if (!response.ok) return '';
  return response.text();
}

async function fetchJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json', ...(init.headers || {}) },
    signal: init.signal ?? AbortSignal.timeout(PAGE_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

function firstHttps(...candidates: Array<unknown>): string {
  for (const value of candidates) {
    if (typeof value !== 'string') continue;
    const trimmed = value.replace(/\\u0026/g, '&').replace(/\\\//g, '/').trim();
    if (/^https:\/\//i.test(trimmed)) return trimmed;
  }
  return '';
}

function metaContent(html: string, property: string): string {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const a = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'));
  if (a?.[1]) return a[1].replace(/&amp;/g, '&');
  const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i'));
  return b?.[1] ? b[1].replace(/&amp;/g, '&') : '';
}

function jsonStringField(source: string, key: string): string {
  const re = new RegExp(`"${key}"\\s*:\\s*"(https:[^"]+)"`, 'i');
  const match = source.match(re);
  return match ? match[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/') : '';
}

/* -------------------------------------------------------------------------- */
/* YouTube / YT Music                                                         */
/* -------------------------------------------------------------------------- */

export interface InnertubeClient {
  /** Label used in logs/tests. */
  name: string;
  clientName: string;
  clientVersion: string;
  userAgent: string;
  clientId: string;
  extra?: Record<string, unknown>;
  /**
   * When true, the request body includes `context.thirdParty.embedUrl` so
   * YouTube treats this as an embedded player request. Embedded players on
   * smart TVs / game consoles don't have login flows, so YouTube does not
   * enforce age-gate / LOGIN_REQUIRED on them — this is the automatic
   * bypass for age-restricted videos that would otherwise need cookies.
   */
  embed?: boolean;
  /**
   * Optional public Innertube API key appended to the player query string
   * (?key=...). Required by the WEB_EMBEDDED_PLAYER client. This is a
   * non-secret value baked into every YouTube web player.
   */
  apiKey?: string;
  /**
   * When set together with `embed`, use this origin as the thirdParty
   * embedUrl instead of https://www.youtube.com/watch?v=... A non-YouTube
   * origin is what the WEB_EMBEDDED_PLAYER sends for third-party embeds and
   * can succeed where a same-origin embedUrl is refused. Since 2026-03
   * YouTube refuses web-embedded requests whose embedUrl is a youtube.com
   * origin ("This video is unavailable. Error code: 152"), so this MUST be a
   * non-YouTube URL (yt-dlp uses https://www.reddit.com/). The same value is
   * also sent as the Referer header on the player request.
   */
  thirdPartyEmbedUrl?: string;
  /**
   * True for clients whose player request must NOT carry
   * serviceIntegrityDimensions.poToken. TV clients ignore the field and can
   * refuse the request when it is present, so the externally-provided PO
   * token is kept off their body (context.client.visitorData is still
   * attached — it is harmless and YouTube expects it).
   */
  skipPoToken?: boolean;
}

/**
 * Innertube clients that still hand back *direct* `url` fields (no
 * signatureCipher), so we never need to run YouTube's player JS to decipher a
 * signature or the throttling `n` parameter.
 *
 * Versions are kept in step with yt-dlp's `INNERTUBE_CLIENTS` table, which is
 * the most actively maintained public source of working client versions.
 * ANDROID_TESTSUITE was deliberately NOT included: YouTube retired it and
 * yt-dlp dropped it, so it is a guaranteed-dead request on every lookup.
 *
 * Ordering matters — the first client that reports playabilityStatus OK *and*
 * exposes at least one direct URL wins.
 */
export const INNERTUBE_CLIENTS: InnertubeClient[] = [
  // YouTube Music clients go first. Label/Topic uploads such as Tobu – Hope
  // (Y1Z3Q3O7IRE) often return SABR-only / empty streamingData on ANDROID
  // but still hand back direct itag 18 + itag 140 here. This is the same
  // family of clients 9convert-style extractors use for music videos.
  {
    name: 'android_music',
    clientName: 'ANDROID_MUSIC',
    clientVersion: '7.27.52',
    userAgent: 'com.google.android.apps.youtube.music/7.27.52 (Linux; U; Android 11) gzip',
    clientId: '21',
    extra: { androidSdkVersion: 30, osName: 'Android', osVersion: '11' },
  },
  {
    name: 'ios_music',
    clientName: 'IOS_MUSIC',
    clientVersion: '7.27.0',
    userAgent: 'com.google.ios.youtubemusic/7.27.0 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
    clientId: '26',
    extra: {
      deviceMake: 'Apple',
      deviceModel: 'iPhone16,2',
      osName: 'iPhone',
      osVersion: '18.3.2.22D82',
    },
  },
  {
    name: 'android',
    clientName: 'ANDROID',
    clientVersion: '21.26.364',
    userAgent: 'com.google.android.youtube/21.26.364 (Linux; U; Android 11) gzip',
    clientId: '3',
    extra: { androidSdkVersion: 30, osName: 'Android', osVersion: '11' },
  },
  {
    name: 'ios',
    clientName: 'IOS',
    clientVersion: '21.26.4',
    userAgent: 'com.google.ios.youtube/21.26.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
    clientId: '5',
    extra: {
      deviceMake: 'Apple',
      deviceModel: 'iPhone16,2',
      osName: 'iPhone',
      osVersion: '18.3.2.22D82',
    },
  },
  {
    // No JS player required and frequently still serves direct URLs when the
    // phone clients are throttled. "Made for kids" videos are unavailable here.
    name: 'android_vr',
    clientName: 'ANDROID_VR',
    clientVersion: '1.65.10',
    userAgent:
      'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
    clientId: '28',
    extra: {
      deviceMake: 'Oculus',
      deviceModel: 'Quest 3',
      androidSdkVersion: 32,
      osName: 'Android',
      osVersion: '12L',
    },
  },
  {
    name: 'visionos',
    clientName: 'VISIONOS',
    clientVersion: '1.02',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
    clientId: '101',
    extra: {
      deviceMake: 'Apple',
      deviceModel: 'RealityDevice17,1',
      osName: 'visionOS',
      osVersion: '26.5.23O471',
    },
  },
  {
    // Web embedded player. This one acts as an embed on a THIRD-PARTY origin
    // (embedUrl is not youtube.com), which is the configuration YouTube's own
    // iframe embed uses and which often still returns direct streams for
    // label/age-gated content when the phone clients refuse. It is YouTube's
    // current mechanism for embeddable age-gated videos (yt-dlp appends this
    // client whenever another client reports an age gate), so it doubles as
    // the automatic age-gate bypass. Carries a public INNERTUBE_API_KEY so
    // the player endpoint accepts the request (this is the same well-known
    // key shipped in every YouTube web player; it is not a secret).
    //
    // Version/context follow yt-dlp's `web_embedded` entry and
    // `_fix_embedded_ytcfg` (verified 2026-08-12). The 1.20240726.00.00
    // version previously shipped here was refused with "This video is
    // unavailable"; yt-dlp fixed the same symptom in 2026-03 by (a) bumping
    // the version to the current 2.2026xxxx.xx.xx string and (b) sending a
    // NON-YouTube embedUrl — youtube.com origins now get error 152. The
    // embedUrl is also sent as the Referer header.
    name: 'web_embedded',
    clientName: 'WEB_EMBEDDED_PLAYER',
    clientVersion: '2.20260708.00.00',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
    clientId: '56',
    embed: true,
    // The web embed client requires the public Innertube API key on the
    // player query string. This is a well-known, non-secret value shipped in
    // every YouTube web player; an operator can override it via YT_API_KEY
    // if YouTube rotates it before this list is updated.
    apiKey: process.env.YT_API_KEY || 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8',
    // A non-YouTube embed origin is what makes this a genuine third-party
    // embed. yt-dlp's `_fix_embedded_ytcfg` uses https://www.reddit.com/ and
    // notes "Can be any valid non-YouTube URL"; a youtube.com origin is
    // refused (error 152, see yt-dlp#16077/#16177).
    thirdPartyEmbedUrl: 'https://www.reddit.com/',
  },
  {
    // TV client (yt-dlp's `tv` entry, verified 2026-08-12). Replaces the old
    // TVHTML5_SIMPLY_EMBEDDED_PLAYER entry, which yt-dlp removed in 2026-01
    // ("YouTube is no longer supported in this application or device" — it
    // now requires sign-in for every video) — the age-gate bypass role has
    // moved to web_embedded above. Tried last so it only fires when every
    // direct client already refused. The plain TVHTML5 client carries no
    // thirdParty embed context and ignores serviceIntegrityDimensions.
    name: 'tv',
    clientName: 'TVHTML5',
    clientVersion: '7.20260707.07.00',
    userAgent:
      'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/25.lts.30.1034943-gold (unlike Gecko), Unknown_TV_Unknown_0/Unknown (Unknown, Unknown)',
    clientId: '7',
    skipPoToken: true,
  },
];

/** A format is only usable if it carries a real, non-empty string URL. */
export function hasDirectUrl(format: PlayerFormat): boolean {
  return typeof format.url === 'string' && format.url.trim().length > 0;
}

/**
 * Flatten streamingData and keep only direct-URL formats.
 *
 * `signatureCipher` / `cipher` entries are dropped on purpose: decoding them
 * requires executing YouTube's player JS, which we do not do. Keeping them
 * would let a cipher-only format win the pick and produce a dead download.
 */
export function collectPlayerFormats(data: Record<string, unknown>): PlayerFormat[] {
  const streaming = (data.streamingData || {}) as {
    formats?: PlayerFormat[];
    adaptiveFormats?: PlayerFormat[];
  };
  const all = [...(streaming.formats || []), ...(streaming.adaptiveFormats || [])];
  return all.filter(hasDirectUrl);
}

/**
 * Attach a GVS / media-URL PO token to googlevideo playback URLs.
 * YouTube requires this token on the CDN request independently of the
 * player-request token. Invalid tokens are ignored (never appended).
 */
export function attachMediaUrlToken(url: string, pot: string | undefined | null): string {
  if (!pot || !url) return url;
  try {
    const parsed = new URL(url);
    if (!/googlevideo\.com$/i.test(parsed.hostname)) return url;
    if (parsed.searchParams.has('pot')) return url;
    parsed.searchParams.set('pot', pot);
    parsed.searchParams.set('potc', '1');
    return parsed.toString();
  } catch {
    return url;
  }
}

/** Playability states we can explain to the user instead of a generic failure. */
const PLAYABILITY_MESSAGES: Record<string, string> = {
  LOGIN_REQUIRED: 'This video is age-restricted or private, so YouTube requires a signed-in account.',
  AGE_VERIFICATION_REQUIRED: 'This video is age-restricted, so YouTube requires a verified account.',
  UNPLAYABLE: 'YouTube marked this video as unplayable (it may be private, removed, or region-locked).',
  ERROR: 'YouTube could not load this video (it may have been removed).',
  CONTENT_CHECK_REQUIRED: 'This video is flagged as sensitive and needs a confirmation YouTube only accepts from a signed-in account.',
  LIVE_STREAM_OFFLINE: 'This live stream is offline, so there is no file to download.',
};

export interface InnertubeResult {
  formats: PlayerFormat[];
  /** Populated when every client failed for an explainable reason. */
  status?: string;
  reason?: string;
  /** True when at least one client encountered a BotGuard challenge. */
  botChallenged?: boolean;
}

/**
 * True when YouTube's refusal is a BotGuard / "prove you're human" challenge
 * rather than a genuine age-gate or privacy restriction.
 *
 * YouTube returns LOGIN_REQUIRED for both cases, but the reason text differs:
 * a datacenter IP that has been challenged gets "Sign in to confirm you're
 * not a bot". Conflating the two produced a misleading error ("age-restricted
 * or private") for videos that are perfectly public — the real fix is an
 * attested PO token from the sidecar, not a signed-in account.
 */
export function isBotChallenge(status?: string, reason?: string): boolean {
  if (!reason) return false;
  if (status && status !== 'LOGIN_REQUIRED' && status !== 'ERROR' && status !== 'UNPLAYABLE') {
    return false;
  }
  return /confirm\s+you(?:'|’)?re\s+not\s+a\s+bot|not\s+a\s+bot|unusual\s+traffic|suspicious\s+activity/i.test(
    reason,
  );
}

/**
 * Human-readable message for a non-OK playabilityStatus, or '' if unknown.
 *
 * `poTokenConfigured` only changes the diagnostic wording. Public visitors
 * get an actionable 9Convert fallback, not instructions to operate a token
 * service that would be useless unless it shared the website's public IP.
 */
export function playabilityMessage(
  status?: string,
  reason?: string,
  poTokenConfigured = false,
): string {
  if (!status || status === 'OK') return '';
  // Report a bot check as exactly that — never as "age-restricted or private".
  if (isBotChallenge(status, reason)) {
    // Exactly ONE actionable instruction. This message is composed with
    // `withFallbackHint`, which will not append a second "try a converter"
    // sentence once it sees the 9Convert pointer here.
    return poTokenConfigured
      ? 'YouTube served a bot check (\u201cSign in to confirm you\u2019re not a bot\u201d) for this server\u2019s IP, and the configured PO token did not clear it. Use the 9Convert option below.'
      : 'YouTube served a bot check (\u201cSign in to confirm you\u2019re not a bot\u201d) for this server\u2019s IP. Use the 9Convert option below.';
  }
  const base = PLAYABILITY_MESSAGES[status];
  if (base) return base;
  return reason
    ? `YouTube refused playback: ${reason}`
    : `YouTube refused playback (${status}).`;
}

/**
 * Append the single "try a converter" pointer to a message — but only when
 * the message does not already tell the visitor where to go.
 *
 * Before this, a bot-check failure read:
 *   "…for this server's IP. Use the 9Convert option below. Try a converter
 *    below."
 * Two instructions for one action is noise, and it made the app look broken
 * rather than degraded. Visitors get exactly one actionable next step.
 */
export function withFallbackHint(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return 'Try a converter below.';
  // Already points somewhere concrete (9Convert card, converter list, …).
  if (/\b(option|converter|converters)\s+below\b/i.test(trimmed)) return trimmed;
  return /[.!?]$/.test(trimmed) ? `${trimmed} Try a converter below.` : `${trimmed}. Try a converter below.`;
}

/**
 * True when a set of formats can satisfy both an audio-only and a video
 * download. Verified live 2026-08-12: ANDROID answers OK but returns a single
 * direct URL (itag 18, progressive 360p) with everything else SABR-only, so
 * stopping at the first client with *any* direct URL capped video at 360p and
 * made mp3 downloads impossible. We therefore keep querying until we hold
 * both kinds, and merge what the clients give us.
 */
function hasAudioAndVideo(formats: PlayerFormat[]): boolean {
  const audio = formats.some(f => /audio\//i.test(f.mimeType || ''));
  const video = formats.some(f => /video\//i.test(f.mimeType || ''));
  return audio && video;
}

/** De-duplicate merged formats by itag, keeping the first (best client) entry. */
function dedupeByItag(formats: PlayerFormat[]): PlayerFormat[] {
  const seen = new Set<number | string>();
  const out: PlayerFormat[] = [];
  for (const f of formats) {
    const key = f.itag ?? f.url ?? '';
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

/**
 * Validate and sanitize a raw Cookie header value supplied by the end user.
 * Returns the cleaned string, or null when nothing usable was provided.
 *
 * Rules: only printable ASCII (0x20–0x7E), no CR/LF (header injection), and
 * a hard 4 KB cap. Cookies are forwarded verbatim to YouTube's Innertube API
 * so the user's own signed-in session can bypass age-gate / login-required
 * gates — but we never log, cache, or store them.
 */
export function sanitizeYouTubeCookies(raw: string): string | null {
  if (!raw) return null;
  // Strip CR/LF/tab to prevent header injection; keep everything else
  // (cookie values can contain =, ;, %, etc.).
  const cleaned = raw.replace(/[\r\n\t]/g, '').trim();
  if (!cleaned || cleaned.length > 4096) return null;
  // Reject anything with non-printable or non-ASCII characters.
  if (!/^[\x20-\x7E]+$/.test(cleaned)) return null;
  return cleaned;
}

export interface InnertubeOptions {
  /** Optional raw Cookie header for signed-in sessions (age-gate bypass). */
  cookies?: string;
  /**
   * Optional service-generated PO token + visitor data, fetched from an
   * external PO-token server (see ./po-token). When present the token is
   * attached under `serviceIntegrityDimensions` so YouTube treats the request
   * as coming from an attested client — this is what unblocks music-label
   * videos that otherwise return SABR-only / empty streamingData. The main
   * app NEVER generates this token itself.
   */
  poToken?: { visitorData: string; poToken: string; client?: string };
}

export interface InnertubePlayerRequest {
  endpoint: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/**
 * Build the exact Innertube player request for one client. Shared by
 * innertubeFormats(), the live verify script, and the unit tests so the
 * probe can never drift from the real code path.
 *
 * `cookies` must already be sanitized (see sanitizeYouTubeCookies).
 */
export function buildInnertubePlayerRequest(
  client: InnertubeClient,
  videoId: string,
  options: InnertubeOptions = {},
): InnertubePlayerRequest {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': client.userAgent,
    'X-YouTube-Client-Name': client.clientId,
    'X-YouTube-Client-Version': client.clientVersion,
  };
  // Forward the user's own YouTube cookies so Innertube sees a signed-in
  // session — this is what bypasses LOGIN_REQUIRED on age-gated videos.
  // The cookies are never logged or cached (see route handlers).
  if (options.cookies) {
    headers['Cookie'] = options.cookies;
    // When authenticated, Innertube also wants an Authorization header
    // derived from the SAPISID cookie. We do NOT generate one (no
    // PO-token emulation); YouTube accepts bare cookies without SAPISIDHASH
    // for most age-gate bypasses on the player endpoint.
  }
  // Embedded clients are asked to behave like a third-party iframe embed
  // (yt-dlp#16177): the request carries a Referer matching the embedUrl.
  // A youtube.com Referer/embedUrl is refused since 2026-03.
  if (client.embed && client.thirdPartyEmbedUrl) {
    headers['Referer'] = client.thirdPartyEmbedUrl;
  }

  // Build the Innertube context. Embed clients (WEB_EMBEDDED_PLAYER) need
  // `thirdParty.embedUrl` so YouTube treats the request as coming from an
  // embedded player — this is what bypasses the age gate automatically.
  const clientContext: Record<string, unknown> = {
    clientName: client.clientName,
    clientVersion: client.clientVersion,
    hl: 'en',
    gl: 'US',
    utcOffsetMinutes: 0,
    userAgent: client.userAgent,
    ...(client.extra || {}),
  };
  // Attach externally-generated visitor data when available. The token
  // itself goes under serviceIntegrityDimensions (below), but visitorData
  // must live on the client context.
  if (options.poToken?.visitorData) {
    clientContext.visitorData = options.poToken.visitorData;
  }
  const context: Record<string, unknown> = { client: clientContext };
  if (client.embed) {
    context.thirdParty = {
      embedUrl: client.thirdPartyEmbedUrl || `https://www.youtube.com/watch?v=${videoId}`,
    };
  }

  // Assemble the request body. PO tokens (content-bound) go under
  // serviceIntegrityDimensions.poToken. TV clients ignore the field and can
  // refuse the request when it is present, so skipPoToken clients keep it
  // out of their body.
  const body: Record<string, unknown> = {
    videoId,
    contentCheckOk: true,
    racyCheckOk: true,
    context,
  };
  const tokenMatchesClient = !options.poToken?.client || options.poToken.client === client.clientName;
  if (options.poToken?.poToken && tokenMatchesClient && !client.skipPoToken) {
    body.serviceIntegrityDimensions = { poToken: options.poToken.poToken };
  }

  // The WEB_EMBEDDED_PLAYER client requires the public API key on the
  // query string. Other clients reject or ignore it, so only append it
  // when the client declares one.
  const endpoint = client.apiKey
    ? `https://www.youtube.com/youtubei/v1/player?prettyPrint=false&key=${encodeURIComponent(client.apiKey)}`
    : 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';

  return { endpoint, headers, body };
}

export async function innertubeFormats(
  videoId: string,
  options?: InnertubeOptions,
): Promise<InnertubeResult> {
  let lastStatus: string | undefined;
  let lastReason: string | undefined;
  let botChallenged = false;
  const collected: PlayerFormat[] = [];
  const cookieHeader = options?.cookies ? sanitizeYouTubeCookies(options.cookies) : null;

  for (const client of INNERTUBE_CLIENTS) {
    try {
      const { endpoint, headers, body } = buildInnertubePlayerRequest(client, videoId, {
        ...(cookieHeader ? { cookies: cookieHeader } : {}),
        poToken: options?.poToken,
      });
      const response = await youtubeAwareFetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(PLAYER_TIMEOUT_MS),
      });
      if (!response.ok) continue;
      const data = (await response.json()) as Record<string, unknown>;
      const playability = (data.playabilityStatus || {}) as { status?: string; reason?: string };
      if (isBotChallenge(playability.status, playability.reason)) {
        botChallenged = true;
      }
      if (playability.status && playability.status !== 'OK') {
        lastStatus = playability.status;
        lastReason = playability.reason;
        continue;
      }
      // Only accept a client whose response actually contains a playable,
      // direct URL. A client can answer OK and still return nothing but
      // signatureCipher entries or a SABR-only manifest.
      const formats = collectPlayerFormats(data).map(playerFormat => ({
        ...playerFormat,
        sourceClient: client.clientName,
      }));
      if (formats.length === 0) continue;

      collected.push(...formats);
      // Return as soon as we can serve both mp3 and mp4; otherwise keep going
      // so a client offering only one progressive stream cannot cap quality
      // or break audio-only downloads.
      if (hasAudioAndVideo(collected)) {
        return {
          formats: dedupeByItag(collected),
          botChallenged: botChallenged || undefined,
        };
      }
    } catch {
      // try the next client
    }
  }

  if (collected.length > 0) {
    return {
      formats: dedupeByItag(collected),
      botChallenged: botChallenged || undefined,
    };
  }
  return {
    formats: [],
    status: lastStatus,
    reason: lastReason,
    botChallenged: botChallenged || isBotChallenge(lastStatus, lastReason) || undefined,
  };
}

function fromInvidious(data: Record<string, unknown>): PlayerFormat[] {
  const out: PlayerFormat[] = [];
  const progressive = (data.formatStreams || []) as Array<Record<string, unknown>>;
  for (const item of progressive) {
    out.push({
      url: typeof item.url === 'string' ? item.url : undefined,
      mimeType: typeof item.type === 'string' ? item.type : 'video/mp4',
      qualityLabel: typeof item.qualityLabel === 'string' ? item.qualityLabel : undefined,
      audioQuality: 'AUDIO_QUALITY_MEDIUM',
      bitrate: typeof item.bitrate === 'number' ? item.bitrate : Number(item.bitrate) || 0,
      height: parseInt(String(item.resolution || item.qualityLabel || '0'), 10) || 0,
      itag: Number(item.itag) || 0,
    });
  }
  const adaptive = (data.adaptiveFormats || []) as Array<Record<string, unknown>>;
  for (const item of adaptive) {
    const type = typeof item.type === 'string' ? item.type : '';
    out.push({
      url: typeof item.url === 'string' ? item.url : undefined,
      mimeType: type,
      qualityLabel: typeof item.qualityLabel === 'string' ? item.qualityLabel : undefined,
      audioQuality: /audio\//i.test(type) ? 'AUDIO_QUALITY_MEDIUM' : undefined,
      bitrate: typeof item.bitrate === 'number' ? item.bitrate : Number(item.bitrate) || 0,
      height: parseInt(String(item.resolution || item.qualityLabel || '0'), 10) || 0,
      itag: Number(item.itag) || 0,
    });
  }
  return out;
}

export async function invidiousFormats(videoId: string): Promise<PlayerFormat[]> {
  const attempts = await Promise.all(
    INVIDIOUS_INSTANCES.map(async base => {
      try {
        const response = await fetch(invidiousVideoUrl(base, videoId), {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; YTConvert/1.0)' },
          signal: AbortSignal.timeout(PLAYER_TIMEOUT_MS),
        });
        if (!response.ok) return [];
        const data = (await response.json()) as Record<string, unknown>;
        return fromInvidious(data).filter(
          playerFormat => hasDirectUrl(playerFormat) && isAllowedMediaUrl(playerFormat.url!),
        );
      } catch {
        return [];
      }
    }),
  );
  return attempts.find(formats => formats.length > 0) || [];
}

export interface ExtractOptions {
  /** Optional YouTube session cookies for age-gate / login-required bypass. */
  youTubeCookies?: string;
}

async function extractYouTube(
  pageUrl: string,
  format: FormatKey,
  quality?: string,
  options?: ExtractOptions,
): Promise<ExtractResult> {
  const id = extractYouTubeId(pageUrl);
  if (!id) return fail('Invalid YouTube URL');

  // If an external PO-token server is configured, fetch a token up front so
  // it can be attached to the Innertube player requests. A failure here is
  // non-fatal: we proceed without it and the downstream fallbacks run.
  const poTokenConfigured = isPoTokenServerConfigured();
  // Session token first (visitorData + session-bound WebPO). Player tokens
  // are content-bound to this video id. GVS tokens go on media URLs.
  // Bind tokens to ANDROID_MUSIC for typical label/Topic tracks (Tobu – Hope)
  // as well as ANDROID for everything else. One player token is reused across
  // the client table; visitorData must stay the same.
  const tokenClient = 'ANDROID_MUSIC';
  const sessionToken = await getPoToken({ context: 'session', client: tokenClient }).catch(() => null);
  const playerToken = sessionToken
    ? await getPoToken({
        context: 'player',
        client: tokenClient,
        videoId: id,
        visitorData: sessionToken.visitorData,
      }).catch(() => null)
    : null;
  const gvsToken = sessionToken
    ? await getPoToken({
        context: 'gvs',
        client: tokenClient,
        visitorData: sessionToken.visitorData,
      }).catch(() => null)
    : null;

  const playerPo = playerToken || sessionToken;

  // Primary: Innertube clients that return direct googlevideo URLs.
  let innertube = await innertubeFormats(id, {
    cookies: options?.youTubeCookies,
    poToken: playerPo ?? undefined,
  });

  // Durable fix for the bot wall: when every client was refused with a
  // BotGuard IP challenge — or when the up-front token fetch failed and so the
  // request went out unattested — mint a FRESH token and retry the player
  // request exactly once. A burnt or missing token fails identically on
  // replay, so only a forced refresh can change the outcome.
  //
  // HARD BOUNDARY: the app still never emulates BotGuard itself. This only
  // re-asks the operator's sidecar; with no sidecar configured there is
  // nothing to retry and we fall through to the other extractors.
  if (
    poTokenConfigured &&
    !innertube.formats.length &&
    (innertube.botChallenged || isBotChallenge(innertube.status, innertube.reason) || !playerPo)
  ) {
    const freshToken = await getPoToken({
      context: 'player',
      client: tokenClient,
      videoId: id,
      visitorData: sessionToken?.visitorData,
      forceRefresh: true,
    }).catch(() => null);
    if (freshToken && freshToken.poToken !== playerPo?.poToken) {
      const retried = await innertubeFormats(id, {
        cookies: options?.youTubeCookies,
        poToken: freshToken,
      });
      // Keep the retry only when it actually improved things, so a flakier
      // second answer cannot mask the first, more specific refusal.
      if (retried.formats.length || !innertube.status) innertube = retried;
    }
  }

  // When YouTube issues a bot challenge on this server's egress IP, any
  // googlevideo media URL fetched from this host will serve an HTML challenge
  // page rather than actual media bytes. Discard direct Innertube streams,
  // skip the Piped/Invidious mirror race (same egress IP / same wall), and go
  // straight to 9Convert then cobalt.
  const ipBotBlocked = Boolean(innertube.botChallenged || isBotChallenge(innertube.status, innertube.reason));
  let formats = ipBotBlocked ? [] : innertube.formats;
  let source: 'innertube' | 'piped' | 'invidious-latest' | 'invidious-api' | 'youtube-embed' | '9convert' | 'cobalt' = 'innertube';
  let pipedError: string | undefined;

  const want = format === 'mp4' ? 'video' : 'audio';

  if (!formats.length && !ipBotBlocked) {
    // Mirror paths are independent and public instances disappear often. Race
    // them so a dead first host cannot multiply 10–12 second timeouts. Prefer
    // relayed Piped/latest_version streams, because googlevideo URLs are bound
    // to the public IP that extracted them; those relays preserve that egress.
    const [piped, latest, invidious, embed] = await Promise.all([
      pipedFormats(id),
      invidiousLatestVersionFormats(id),
      invidiousFormats(id),
      youtubeEmbedFormats(id),
    ]);
    pipedError = piped.error;
    if (piped.formats.length) {
      formats = piped.formats;
      source = 'piped';
    } else if (latest.length) {
      formats = latest;
      source = 'invidious-latest';
    } else if (invidious.length) {
      formats = invidious;
      source = 'invidious-api';
    } else if (embed.length) {
      formats = embed;
      source = 'youtube-embed';
    }
  }

  // MP3 requests: the direct clients/mirrors/Piped never produce a real MP3
  // (they serve M4A/AAC or Opus/WebM). Continue to the farm and cobalt paths
  // even when formats exist so a transcoded MP3 is preferred over silently
  // handing back a renamed M4A. MP4 keeps the existing "formats present → use
  // them" fast path.
  const needTranscodedMp3 = want === 'audio'
    && formats.length > 0
    && !formats.some(f => /audio\/(mpeg|mp3)/i.test(f.mimeType || ''));
  if (needTranscodedMp3) formats = [];

  // Public 9Convert family farm. It performs extraction/conversion on its own
  // egress IP and returns a completed allowlisted dlink, which is why it can
  // survive a BotGuard wall on this Vercel host. Empty/404 farm hops are
  // explicitly non-fatal and fall through to cobalt/the honest error below.
  let cobaltError: string | undefined;
  if (!formats.length) {
    const farmFormats = await nineConvertFormats(id, format === 'mp4' ? 'mp4' : 'mp3', quality);
    if (farmFormats.length) {
      formats = farmFormats;
      source = '9convert';
    }
  }

  // Last resort: cobalt — the operator's own instance first, then the
  // reviewed public instances the directory reports as YouTube-healthy. It
  // returns a finished muxed file rather than a format list, so it runs only
  // when everything else produced nothing.
  //
  // Every URL it hands back is re-checked against the media-host allowlist
  // here, so even a compromised instance cannot make /api/convert fetch an
  // arbitrary host. A URL that fails that check is treated as no result at
  // all rather than being silently proxied.
  if (!formats.length && isCobaltConfigured()) {
    const cobalt = await cobaltFormats(pageUrl, format === 'mp4' ? 'video' : 'audio');
    const cobaltUrls = cobalt.formats.filter(f => f.url && isAllowedMediaUrl(f.url));
    if (cobaltUrls.length) {
      formats = cobaltUrls;
      source = 'cobalt';
    } else {
      cobaltError =
        cobalt.error ?? (cobalt.formats.length ? 'returned a non-allowlisted media host' : undefined);
    }
  }

  if (!formats.length) {
    // Prefer an honest, specific reason over the generic message when YouTube
    // told us why (age-gate, private, region-lock, removed...).
    const statusToExplain = innertube.status || (innertube.botChallenged ? 'LOGIN_REQUIRED' : undefined);
    const reasonToExplain = innertube.reason || (innertube.botChallenged ? "Sign in to confirm you're not a bot" : undefined);
    const explained = playabilityMessage(statusToExplain, reasonToExplain, poTokenConfigured);
    if (explained) return fail(withFallbackHint(explained));
    // Piped sometimes returns a descriptive reason ("Video unavailable",
    // "This video is age-restricted", "region-locked") when Innertube gave us
    // nothing actionable. Surface it so the error isn't a vague "try again".
    // A bare transport failure ("HTTP 404", "fetch failed") says nothing about
    // the video, so it must not mask a later source's real verdict.
    const pipedIsDescriptive = Boolean(pipedError) && !/^(HTTP \d+|fetch failed)$/i.test(pipedError!.trim());
    if (pipedIsDescriptive) {
      return fail(withFallbackHint(friendlyPipedError(pipedError!)));
    }
    if (cobaltError) {
      // `cobaltError` carries raw instance diagnostics ("kitty.tame.gg:
      // error.api.auth.turnstile.missing"). Log it for the operator, but show
      // the visitor a plain sentence with one instruction — an internal host
      // name and error code mean nothing to them.
      console.warn('[cobalt] all candidates failed:', cobaltError);
      return fail(
        withFallbackHint('No independent conversion service could fetch this video right now.'),
      );
    }
    if (pipedError) {
      return fail(withFallbackHint(friendlyPipedError(pipedError)));
    }
    return fail(
      withFallbackHint(
        'YouTube did not return a playable stream. This can happen for music-label videos, region-locked uploads, or recently removed content.',
      ),
    );
  }

  const kind = format === 'mp4' ? 'video' : 'audio';

  // MP3 requests: only accept a real audio/mpeg stream (returned by the
  // 9Convert/cobalt fallbacks). Innertube/Mirrors/Piped never produce MP3;
  // they return M4A/AAC or Opus/WebM. If no real MP3 source is among the
  // current formats, return an error so the caller surfaces an honest
  // "try a converter" message rather than saving an M4A renamed .mp3.
  if (kind === 'audio') {
    const mp3 = pickYouTubeFormat(formats, 'audio', quality);
    if (mp3?.url) {
      const mimeType = mp3.mimeType || 'audio/mpeg';
      const gvsMatchesPickedClient = source === 'innertube'
        && Boolean(gvsToken?.client)
        && gvsToken?.client === mp3.sourceClient;
      const mediaUrl = gvsMatchesPickedClient
        ? attachMediaUrlToken(mp3.url, gvsToken?.poToken)
        : mp3.url;
      const notes: Partial<Record<typeof source, string>> = {
        piped: 'Piped fallback stream',
        'invidious-latest': 'Invidious relayed stream',
        'invidious-api': 'Invidious fallback stream',
        'youtube-embed': 'YouTube embed fallback stream',
        '9convert': '9Convert farm fallback',
        cobalt: 'Cobalt fallback stream',
      };
      return ok({
        url: mediaUrl,
        mimeType: /audio\/(mpeg|mp3)/i.test(mimeType) ? 'audio/mpeg' : mimeType,
        extension: 'mp3',
        qualityLabel: mp3.qualityLabel,
        note: notes[source],
      });
    }
    return fail(
      'No real MP3 source is available from this server. The available streams are M4A/AAC or Opus/WebM — use the converter below for an MP3.',
    );
  }

  // MP4: require a real progressive (muxed, video+audio) MP4. Preserve itag
  // 18 when no adaptive-with-audio path exists.
  let picked = pickYouTubeFormat(formats, 'video', quality);
  if (!picked?.url) {
    // Fallback: if pickYouTubeFormat couldn't find a progressive MP4 but a
    // progressive itag 18 is present, use it. This mirrors the existing
    // "preserve progressive itag 18" contract.
    const itag18 = formats.find(f => f.itag === 18 && typeof f.url === 'string');
    if (itag18?.url && isProgressiveMp4Itag(18)) picked = itag18;
  }
  if (!picked?.url) {
    return fail(
      'No progressive MP4 with audio is available for this video. Higher resolutions may need a converter that combines separate video and audio tracks — try one below.',
    );
  }

  const mimeType = picked.mimeType || 'video/mp4';
  // GVS tokens are IP/visitor/client-bound. Attach one only to an Innertube
  // URL minted by that same client on this app's egress, never to a URL from
  // another client, embed page, mirror, or farm.
  const gvsMatchesPickedClient = source === 'innertube'
    && Boolean(gvsToken?.client)
    && gvsToken?.client === picked.sourceClient;
  const mediaUrl = gvsMatchesPickedClient
    ? attachMediaUrlToken(picked.url, gvsToken?.poToken)
    : picked.url;
  const notes: Partial<Record<typeof source, string>> = {
    piped: 'Piped fallback stream',
    'invidious-latest': 'Invidious relayed stream',
    'invidious-api': 'Invidious fallback stream',
    'youtube-embed': 'YouTube embed fallback stream',
    '9convert': '9Convert farm fallback',
    cobalt: 'Cobalt fallback stream',
  };
  return ok({
    url: mediaUrl,
    mimeType: /video\/mp4|application\/mp4/i.test(mimeType) ? 'video/mp4' : mimeType,
    extension: 'mp4',
    qualityLabel: picked.qualityLabel,
    note: notes[source],
  });
}

/**
 * Translate a raw Piped error string into a user-facing sentence. Piped
 * echoes YouTube's reason text, which varies widely; we match on stable
 * keywords and otherwise sanitise what we were given.
 */
function friendlyPipedError(raw: string): string {
  const msg = raw.replace(/\s+/g, ' ').trim().slice(0, 200);
  if (/age[- ]?restrict|sign in|login/i.test(msg)) {
    return 'This video is age-restricted, so YouTube requires a signed-in account.';
  }
  // Check copyright / music-label blocks BEFORE the generic region keyword,
  // because label takedowns often also say "blocked in your country".
  if (/copyright|music\W?label|\blabel\b|content\W?id|uploader has blocked|blocked it|blocked on copyright/i.test(msg)) {
    return 'This video is blocked by its music label or copyright holder in this region.';
  }
  if (/region|country|not available in/i.test(msg)) {
    return 'This video is region-locked and unavailable from this server.';
  }
  if (/private/i.test(msg)) {
    return 'This video is private and cannot be downloaded.';
  }
  if (/removed|deleted|unavailable|not available/i.test(msg)) {
    return 'This video has been removed by the uploader or is unavailable.';
  }
  if (/blocked/i.test(msg)) {
    return 'This video is blocked and cannot be downloaded from this server.';
  }
  return msg ? `YouTube refused playback: ${msg}.` : 'YouTube did not return a playable stream.';
}

/* -------------------------------------------------------------------------- */
/* SoundCloud                                                                 */
/* -------------------------------------------------------------------------- */

let soundCloudClient: { id: string; at: number } | null = null;
const SC_CLIENT_TTL_MS = 60 * 60 * 1000;

async function soundCloudClientId(): Promise<string> {
  if (soundCloudClient && Date.now() - soundCloudClient.at < SC_CLIENT_TTL_MS) {
    return soundCloudClient.id;
  }
  const html = await fetchText('https://soundcloud.com/', {});
  const inline = html.match(/client_id["']?\s*[:=]\s*["']([A-Za-z0-9]{16,})["']/);
  if (inline?.[1]) {
    soundCloudClient = { id: inline[1], at: Date.now() };
    return inline[1];
  }
  const scripts = [...html.matchAll(/src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)].map(m => m[1]);
  for (const src of scripts.slice(-6).reverse()) {
    const js = await fetchText(src, {});
    const match = js.match(/client_id:"([A-Za-z0-9]{16,})"/) || js.match(/client_id=([A-Za-z0-9]{16,})/);
    if (match?.[1]) {
      soundCloudClient = { id: match[1], at: Date.now() };
      return match[1];
    }
  }
  return '';
}

async function extractSoundCloud(pageUrl: string, format: FormatKey): Promise<ExtractResult> {
  if (format === 'mp4') {
    return fail('SoundCloud has no video file. Choose audio, or use a converter below.');
  }
  const clientId = await soundCloudClientId();
  if (!clientId) return fail('Could not reach the SoundCloud API. Try a converter below.');

  const resolved = (await fetchJson(
    `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(pageUrl)}&client_id=${encodeURIComponent(clientId)}`,
  )) as Record<string, unknown> | null;
  if (!resolved) return fail('SoundCloud could not resolve this track.');

  const media = (resolved.media || {}) as { transcodings?: Array<Record<string, unknown>> };
  const transcodings = media.transcodings || [];
  const progressive = transcodings.find(t => {
    const fmt = (t.format || {}) as { protocol?: string };
    return fmt.protocol === 'progressive' && typeof t.url === 'string';
  });
  if (!progressive || typeof progressive.url !== 'string') {
    return fail('No progressive SoundCloud download is available for this track.');
  }

  const streamUrl = progressive.url.includes('client_id=')
    ? progressive.url
    : `${progressive.url}${progressive.url.includes('?') ? '&' : '?'}client_id=${encodeURIComponent(clientId)}`;
  const stream = (await fetchJson(streamUrl)) as { url?: string } | null;
  const file = firstHttps(stream?.url);
  if (!file) return fail('SoundCloud did not return a stream URL.');

  const mimeType = /opus|ogg/i.test(String(progressive.preset || '')) ? 'audio/ogg' : 'audio/mpeg';
  return ok({
    url: file,
    mimeType,
    extension: extensionForMime(mimeType, 'mp3'),
    note: 'SoundCloud progressive stream',
  });
}

/* -------------------------------------------------------------------------- */
/* TikTok                                                                     */
/* -------------------------------------------------------------------------- */

export function extractTikTokId(url: string): string | null {
  const match = url.match(/\/video\/(\d{5,})/i) || url.match(/[?&](?:item_id|id)=(\d{5,})/i);
  return match ? match[1] : null;
}

function tiktokFromObject(data: unknown): { url: string; watermarked: boolean } | null {
  if (!data) return null;
  const json = typeof data === 'string' ? data : typeof data === 'object' ? JSON.stringify(data) : '';
  if (!json) return null;
  const download = jsonStringField(json, 'downloadAddr') || jsonStringField(json, 'download_addr');
  const play = jsonStringField(json, 'playAddr') || jsonStringField(json, 'play_addr');
  const url = firstHttps(download, play);
  if (!url) return null;
  return { url, watermarked: !download && Boolean(play) };
}

async function extractTikTok(pageUrl: string, format: FormatKey): Promise<ExtractResult> {
  if (format === 'mp3') {
    return fail('TikTok has no separate audio file we can proxy. Download the video, or use a converter.');
  }
  const id = extractTikTokId(pageUrl);

  if (id) {
    const player = await fetchJson(`https://www.tiktok.com/player/api/v1/items?item_ids=${id}`);
    const fromPlayer = tiktokFromObject(player);
    if (fromPlayer) {
      return ok({
        url: fromPlayer.url,
        mimeType: 'video/mp4',
        extension: 'mp4',
        watermarked: fromPlayer.watermarked,
        note: fromPlayer.watermarked ? 'Official player URL (watermarked)' : 'Official player URL',
      });
    }

    const embed = await fetchText(`https://www.tiktok.com/embed/v2/${id}`, { Referer: 'https://www.tiktok.com/' });
    const fromEmbed = tiktokFromObject(embed);
    if (fromEmbed) {
      return ok({
        url: fromEmbed.url,
        mimeType: 'video/mp4',
        extension: 'mp4',
        watermarked: fromEmbed.watermarked,
        note: fromEmbed.watermarked ? 'Embed player URL (watermarked)' : 'Embed player URL',
      });
    }
  }

  const html = await fetchText(pageUrl, { Referer: 'https://www.tiktok.com/' });
  const universal = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  if (universal?.[1]) {
    try {
      const fromPage = tiktokFromObject(JSON.parse(universal[1]));
      if (fromPage) {
        return ok({
          url: fromPage.url,
          mimeType: 'video/mp4',
          extension: 'mp4',
          watermarked: fromPage.watermarked,
          note: fromPage.watermarked ? 'Page player URL (watermarked)' : 'Page player URL',
        });
      }
    } catch {
      // fall through
    }
  }

  return fail('TikTok did not expose a public video file. Try SSSTik or another converter.');
}

/* -------------------------------------------------------------------------- */
/* X / Twitter                                                                */
/* -------------------------------------------------------------------------- */

export function extractTweetId(url: string): string | null {
  const match = url.match(/status(?:es)?\/(\d{1,20})(?!\d)/i);
  return match ? match[1] : null;
}

/** Public syndication token used by Twitter's own embed widgets (not a session secret). */
export function twitterSyndicationToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
}

function bestMp4Variant(variants: unknown): string {
  if (!Array.isArray(variants)) return '';
  const mp4s = variants
    .map(v => v as { content_type?: string; contentType?: string; bitrate?: number; url?: string })
    .filter(v => /video\/mp4/i.test(v.content_type || v.contentType || '') && typeof v.url === 'string');
  mp4s.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
  return firstHttps(mp4s[0]?.url);
}

async function extractTwitter(pageUrl: string, format: FormatKey): Promise<ExtractResult> {
  if (format === 'mp3') {
    return fail('X/Twitter has no separate audio file we can proxy. Download the video, or use Twitsave.');
  }
  const id = extractTweetId(pageUrl);
  if (!id) return fail('Could not find a tweet id in that link.');

  const token = twitterSyndicationToken(id);
  const data = (await fetchJson(
    `https://cdn.syndication.twimg.com/tweet-result?id=${encodeURIComponent(id)}&lang=en&token=${encodeURIComponent(token)}`,
  )) as Record<string, unknown> | null;

  if (data) {
    const mediaDetails = (data.mediaDetails || data.media_details || []) as Array<Record<string, unknown>>;
    for (const media of mediaDetails) {
      const info = (media.video_info || media.videoInfo || {}) as { variants?: unknown };
      const url = bestMp4Variant(info.variants);
      if (url) {
        return ok({ url, mimeType: 'video/mp4', extension: 'mp4', note: 'Twitter syndication embed' });
      }
    }
      const video = (data.video || {}) as { variants?: unknown };
    const fromVideo = bestMp4Variant(video.variants);
    if (fromVideo) {
      return ok({ url: fromVideo, mimeType: 'video/mp4', extension: 'mp4', note: 'Twitter syndication embed' });
    }
  }

  return fail('X/Twitter did not expose a public video (guest embed failed). Try Twitsave.');
}

/* -------------------------------------------------------------------------- */
/* Instagram                                                                  */
/* -------------------------------------------------------------------------- */

export function extractInstagramShortcode(url: string): string | null {
  const match = url.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  return match ? match[1] : null;
}

async function extractInstagram(pageUrl: string, format: FormatKey): Promise<ExtractResult> {
  if (format === 'mp3') {
    return fail('Instagram has no separate audio file we can proxy. Download the video, or use FastDL.');
  }
  const shortcode = extractInstagramShortcode(pageUrl);
  const candidates = [
    pageUrl,
    shortcode ? `https://www.instagram.com/p/${shortcode}/embed/captioned/` : '',
    shortcode ? `https://www.instagram.com/reel/${shortcode}/embed/` : '',
  ].filter(Boolean);

  for (const target of candidates) {
    const html = await fetchText(target, { Referer: 'https://www.instagram.com/' });
    if (!html) continue;
    const og = firstHttps(metaContent(html, 'og:video'), metaContent(html, 'og:video:secure_url'));
    const jsonUrl = firstHttps(
      jsonStringField(html, 'video_url'),
      jsonStringField(html, 'videoUrl'),
      jsonStringField(html, 'contentUrl'),
    );
    const url = firstHttps(og, jsonUrl);
    if (url) {
      return ok({ url, mimeType: 'video/mp4', extension: 'mp4', note: 'Public Instagram embed / oEmbed video' });
    }
  }

  return fail('Instagram did not expose a public video URL (login wall). Try FastDL or copy the link.');
}

/* -------------------------------------------------------------------------- */
/* Facebook                                                                   */
/* -------------------------------------------------------------------------- */

async function extractFacebook(pageUrl: string, format: FormatKey): Promise<ExtractResult> {
  if (format === 'mp3') {
    return fail('Facebook has no separate audio file we can proxy. Download the video, or use FBDown.');
  }
  const html = await fetchText(pageUrl, { Referer: 'https://www.facebook.com/' });
  if (!html) return fail('Could not load this Facebook page. Only public video / share URLs work.');

  const og = firstHttps(metaContent(html, 'og:video'), metaContent(html, 'og:video:url'), metaContent(html, 'og:video:secure_url'));
  const hd = firstHttps(jsonStringField(html, 'hd_src'), jsonStringField(html, 'hd_src_no_ratelimit'));
  const sd = firstHttps(jsonStringField(html, 'sd_src'), jsonStringField(html, 'sd_src_no_ratelimit'));
  const playable = firstHttps(jsonStringField(html, 'playable_url_quality_hd'), jsonStringField(html, 'playable_url'));
  const url = firstHttps(hd, playable, og, sd);
  if (url) {
    return ok({ url, mimeType: 'video/mp4', extension: 'mp4', note: 'Public Facebook video page' });
  }
  return fail('This Facebook video is not publicly streamable. Try FBDown.');
}

/* -------------------------------------------------------------------------- */
/* DRM / no public file                                                       */
/* -------------------------------------------------------------------------- */

function drmFail(platform: string): ExtractResult {
  return fail(
    `${platform} catalog tracks are DRM-protected (preview only / use a licensed downloader). We do not strip Widevine or FairPlay.`,
  );
}

/* -------------------------------------------------------------------------- */

export async function extractMedia(
  platform: PlatformKey,
  pageUrl: string,
  format: FormatKey,
  quality?: string,
  options?: ExtractOptions,
): Promise<ExtractResult> {
  switch (platform) {
    case 'youtube':
    case 'youtubemusic':
      return extractYouTube(pageUrl, format, quality, options);
    case 'soundcloud':
      return extractSoundCloud(pageUrl, format);
    case 'tiktok':
      return extractTikTok(pageUrl, format);
    case 'twitter':
      return extractTwitter(pageUrl, format);
    case 'instagram':
      return extractInstagram(pageUrl, format);
    case 'facebook':
      return extractFacebook(pageUrl, format);
    case 'spotify':
      return drmFail('Spotify');
    case 'deezer':
      return drmFail('Deezer');
    case 'applemusic':
      return drmFail('Apple Music');
    case 'amazonmusic':
      return drmFail('Amazon Music');
    case 'snapchat':
      return fail('Snapchat does not expose a public media file we can proxy.');
    case 'br':
      return fail('BeReal posts are not available as public downloadable files.');
  }
}

export function isExtractError(result: ExtractResult): result is { error: string } {
  return 'error' in result;
}
