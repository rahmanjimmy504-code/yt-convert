import { NextResponse } from 'next/server';
import {
  canConvertPlatform,
  convertUnavailableReason,
  detectPlatform,
  extractYouTubeId,
  type PlatformKey,
} from '@/lib/platforms';
import { verifyCaptchaToken } from '@/lib/captcha';
import { issueConvertTicket } from '@/lib/convert-ticket';
import { innertubeFormats, sanitizeYouTubeCookies } from '@/lib/extract';
import { INVIDIOUS_INSTANCES, invidiousVideoUrl } from '@/lib/invidious';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { recordEvent } from '@/lib/stats';
import { videoQualityPlans, type VideoQualityPlan } from '@/lib/youtube-formats';

export const runtime = 'nodejs';

export interface VideoInfo {
  title: string;
  author: string;
  thumbnail: string;
  duration: string;
  views: string;
  published: string;
  platform: PlatformKey;
  canConvert?: boolean;
  convertReason?: string;
  convertTicket?: string;
  /**
   * YouTube only: per video-quality option, what the first-party download
   * would require today ('progressive' = a single file meets it, 'mux' = the
   * height only exists as separate video + audio tracks that we cannot
   * combine yet, 'none' = unavailable). `height` is what the current
   * single-file download actually delivers. Undefined when the streaming API
   * could not be reached in time — the result card then shows no note.
   */
  videoQualityPlans?: VideoQualityPlan[];
}

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; YTConvert/1.0)' };

/** Privacy-friendly analytics: record a lookup outcome per platform. */
function recordLookup(platform: PlatformKey | 'unknown', ok: boolean, error?: string): void {
  recordEvent({ type: 'lookup', platform, ok, error });
}

const FETCH_TIMEOUT_MS = 6000;

// Small in-memory cache to avoid hammering upstream oEmbed/Invidious APIs.
// Only the upstream metadata is cached (without convert fields): tickets are
// IP-bound and short-lived, and the DRM reason/ticket must be freshly attached
// per request instead of being served from a shared cache entry.
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;
const cache = new Map<string, { at: number; body: VideoInfo }>();

// Public Invidious instances used as fallbacks for YouTube metadata. Tried in
// order until one responds, so a single dead instance can't break the lookup.

function cacheGet(key: string): VideoInfo | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.body;
}

function cacheSet(key: string, body: VideoInfo) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), body });
}

const RATE_LIMIT = 30; // requests per window per IP

// Proof tokens are single-use on this server instance as an additional guard
// for the local fallback. Cloudflare Turnstile tokens are also single-use at
// its Siteverify endpoint.
const usedCaptchaTokens = new Map<string, number>();

function captchaTokenAlreadyUsed(token: string): boolean {
  const now = Date.now();
  for (const [key, expiresAt] of usedCaptchaTokens) {
    if (expiresAt <= now) usedCaptchaTokens.delete(key);
  }
  if (usedCaptchaTokens.has(token)) return true;
  if (usedCaptchaTokens.size >= 2000) {
    const oldest = usedCaptchaTokens.keys().next().value;
    if (oldest !== undefined) usedCaptchaTokens.delete(oldest);
  }
  usedCaptchaTokens.set(token, now + 10 * 60 * 1000);
  return false;
}

function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function formatCount(n: number): string {
  if (n >= 1_000_000_000) return trimZero((n / 1_000_000_000).toFixed(1)) + 'B';
  if (n >= 1_000_000) return trimZero((n / 1_000_000).toFixed(1)) + 'M';
  if (n >= 1_000) return trimZero((n / 1_000).toFixed(1)) + 'K';
  return String(n);
}

function trimZero(s: string): string {
  return s.replace(/\.0$/, '');
}

/**
 * Normalize a string coming from an upstream oEmbed/Invidious payload:
 * strip control characters, collapse whitespace, and cap the length. These
 * values are embedded straight into the client UI, so untrusted upstreams
 * shouldn't be able to inject odd characters or unbounded payloads.
 */
function clean(v: unknown, max = 300): string {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Only accept http(s) thumbnail URLs; anything else is ignored. */
function cleanUrl(v: unknown): string {
  const s = clean(v, 500);
  return /^https?:\/\//i.test(s) ? s : '';
}

function formatDate(unixSeconds: number): string {
  if (!unixSeconds) return '';
  const d = new Date(unixSeconds * 1000);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Generic oEmbed fetch. Returns an empty object on any failure so callers can fall back. */
async function fetchOEmbed(endpoint: string): Promise<Record<string, unknown>> {
  try {
    const r = await fetch(endpoint, { headers: UA, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!r.ok) return {};
    return (await r.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Resolve `promise` unless it takes longer than `ms`, in which case return
 * `null` instead. Used for advisory work (e.g. format availability) that must
 * never delay the primary metadata response.
 */
async function resolveWithin<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>(resolve => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchYouTube(platform: PlatformKey, rawUrl: string, cookies?: string): Promise<VideoInfo> {
  const id = extractYouTubeId(rawUrl);
  const info: VideoInfo = { title: '', author: '', thumbnail: '', duration: '', views: '', published: '', platform };

  const oembedP = fetchOEmbed(`https://www.youtube.com/oembed?url=${encodeURIComponent(rawUrl)}&format=json`);
  // Try Invidious instances one at a time so a single dead/misbehaving
  // instance (throttled, down, slow) doesn't fail the whole lookup.
  const invidiousP = (async () => {
    if (!id) return null;
    for (const base of INVIDIOUS_INSTANCES) {
      try {
        const r = await fetch(invidiousVideoUrl(base, id), { headers: UA, signal: AbortSignal.timeout(5000) });
        if (r.ok) return (await r.json()) as Record<string, unknown>;
      } catch {
        // try the next instance
      }
    }
    return null;
  })();
  // Phase 0 (stop silently downgrading): find out what each video-quality
  // option would require today. Advisory — the download re-runs extraction at
  // convert time — and capped so a slow/blocked streaming API can never delay
  // metadata (the result card then simply shows no downgrade note).
  const plansP = id
    ? resolveWithin(innertubeFormats(id, { cookies }), 8000).then(result =>
        result && result.formats.length > 0 ? videoQualityPlans(result.formats) : undefined,
      )
    : Promise.resolve(undefined);

  const [oembed, invidious, plans] = await Promise.all([oembedP, invidiousP, plansP]);
  if (plans) info.videoQualityPlans = plans;

  if (oembed.title) info.title = clean(oembed.title, 200);
  if (oembed.author_name) info.author = clean(oembed.author_name, 120);
  if (oembed.thumbnail_url) info.thumbnail = cleanUrl(oembed.thumbnail_url);

  if (invidious) {
    const d = invidious;
    if (typeof d.lengthSeconds === 'number') info.duration = formatDuration(d.lengthSeconds);
    if (typeof d.viewCount === 'number') info.views = formatCount(d.viewCount);
    if (typeof d.published === 'number') info.published = formatDate(d.published);
    if (!info.title && d.title) info.title = clean(d.title, 200);
    if (!info.author && d.author) info.author = clean(d.author, 120);
  }
  return info;
}

async function fetchInfo(platform: PlatformKey, rawUrl: string, cookies?: string): Promise<VideoInfo> {
  const info: VideoInfo = { title: '', author: '', thumbnail: '', duration: '', views: '', published: '', platform };

  if (platform === 'youtube' || platform === 'youtubemusic') {
    return fetchYouTube(platform, rawUrl, cookies);
  }

  // oEmbed-capable platforms (Spotify, Deezer, TikTok, SoundCloud, X, Instagram).
  const oembedEndpoints: Partial<Record<PlatformKey, string>> = {
    spotify: `https://open.spotify.com/oembed?url=${encodeURIComponent(rawUrl)}`,
    deezer: `https://www.deezer.com/oembed?url=${encodeURIComponent(rawUrl)}&format=json`,
    tiktok: `https://www.tiktok.com/oembed?url=${encodeURIComponent(rawUrl)}`,
    soundcloud: `https://soundcloud.com/oembed?url=${encodeURIComponent(rawUrl)}&format=json`,
    twitter: `https://publish.twitter.com/oembed?url=${encodeURIComponent(rawUrl)}&format=json`,
    instagram: `https://www.instagram.com/oembed?url=${encodeURIComponent(rawUrl)}`,
  };

  const endpoint = oembedEndpoints[platform];
  if (endpoint) {
    const d = await fetchOEmbed(endpoint);
    if (d.title) info.title = clean(d.title, 200);
    if (d.author_name) info.author = clean(d.author_name, 120);
    if (d.thumbnail_url) info.thumbnail = cleanUrl(d.thumbnail_url);
  }

  // Degrade to honest placeholders for platforms without a working public API.
  const fallbacks: Partial<Record<PlatformKey, { title: string; author: string }>> = {
    spotify: { title: 'Spotify Track', author: 'Spotify' },
    deezer: { title: 'Deezer Track', author: 'Deezer' },
    applemusic: { title: 'Apple Music Track', author: 'Apple Music' },
    amazonmusic: { title: 'Amazon Music Track', author: 'Amazon Music' },
    br: { title: 'BeReal Post', author: 'BeReal User' },
    tiktok: { title: 'TikTok Video', author: 'TikTok' },
    facebook: { title: 'Facebook Video', author: 'Facebook' },
    soundcloud: { title: 'SoundCloud Track', author: '' },
    twitter: { title: 'X Post', author: 'X' },
    instagram: { title: 'Instagram Post', author: '' },
  };

  if (!info.title) info.title = fallbacks[platform]?.title || 'Media';
  if (!info.author) info.author = fallbacks[platform]?.author || '';
  return info;
}

const RESPONSE_HEADERS = { 'Cache-Control': 'private, no-store' };

/** Attach a fresh ticket. Never cache tickets — they are IP-bound and short-lived. */
function withConvertFields(info: VideoInfo, rawUrl: string, ip: string): VideoInfo {
  const canConvert = canConvertPlatform(info.platform);
  return {
    ...info,
    canConvert,
    convertReason: canConvert ? undefined : convertUnavailableReason(info.platform) || undefined,
    convertTicket: canConvert ? issueConvertTicket(rawUrl, ip) : undefined,
  };
}

export async function GET(request: Request) {
  const ip = clientIp(request);
  const retryAfter = rateLimit(`video-info:${ip}`, RATE_LIMIT);
  if (retryAfter > 0) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  const { searchParams } = new URL(request.url);
  const rawUrl = (searchParams.get('url') || '').trim();

  if (!rawUrl) return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  if (rawUrl.length > 2048) return NextResponse.json({ error: 'URL is too long' }, { status: 400 });

  const platform = detectPlatform(rawUrl);
  if (!platform) {
    recordLookup('unknown', false, 'unsupported url');
    return NextResponse.json({ error: 'Unsupported URL.' }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    recordLookup(platform, false, 'invalid url');
    return NextResponse.json({ error: 'Enter a full URL starting with https://' }, { status: 400 });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    recordLookup(platform, false, 'non-http url');
    return NextResponse.json({ error: 'Only http(s) links are supported' }, { status: 400 });
  }
  if ((platform === 'youtube' || platform === 'youtubemusic') && !extractYouTubeId(rawUrl)) {
    recordLookup(platform, false, 'invalid youtube url');
    return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
  }

  const captchaToken = request.headers.get('x-captcha-token') || '';
  if (!captchaToken || !(await verifyCaptchaToken(captchaToken, ip)) || captchaTokenAlreadyUsed(captchaToken)) {
    recordLookup(platform, false, 'captcha rejected');
    return NextResponse.json(
      { error: 'Complete the CAPTCHA before requesting media information.' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // Optional: user-supplied YouTube session cookies for age-gate bypass.
  // When cookies are present, skip the cache — the advisory quality plans
  // differ for age-gated videos that only resolve with authentication.
  const rawCookies = request.headers.get('x-youtube-cookies') || '';
  const youTubeCookies = sanitizeYouTubeCookies(rawCookies) ?? undefined;
  const hasCookies = Boolean(youTubeCookies);

  const cacheKey = `${platform}|${rawUrl}`;
  let info = hasCookies ? null : cacheGet(cacheKey);
  if (info) {
    recordLookup(platform, true);
    return NextResponse.json(withConvertFields(info, rawUrl, ip), { headers: RESPONSE_HEADERS });
  }

  try {
    info = await fetchInfo(platform, rawUrl, youTubeCookies);
    // Do not cache results obtained with user cookies — they are session-specific
    // and may include different quality plans for age-gated videos.
    if (!hasCookies) {
      cacheSet(cacheKey, info);
    }
    recordLookup(platform, true);
    return NextResponse.json(withConvertFields(info, rawUrl, ip), { headers: RESPONSE_HEADERS });
  } catch (err) {
    console.error('[video-info] failed for', platform, err);
    recordLookup(platform, false, 'fetch failed');
    return NextResponse.json({ error: 'Failed to fetch video info. Please try again.' }, { status: 500 });
  }
}
