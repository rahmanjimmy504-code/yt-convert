import { NextResponse } from 'next/server';
import { detectPlatform, extractYouTubeId, type PlatformKey } from '@/lib/platforms';
import { verifyCaptchaToken } from '@/lib/captcha';

export const runtime = 'nodejs';

export interface VideoInfo {
  title: string;
  author: string;
  thumbnail: string;
  duration: string;
  views: string;
  published: string;
  platform: PlatformKey;
}

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; YTConvert/1.0)' };

const FETCH_TIMEOUT_MS = 6000;

// Small in-memory cache to avoid hammering upstream oEmbed/Invidious APIs.
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;
const cache = new Map<string, { at: number; body: VideoInfo }>();

// Public Invidious instances used as fallbacks for YouTube metadata. Tried in
// order until one responds, so a single dead instance can't break the lookup.
const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net/api/v1/videos/',
  'https://invidious.nerdvpn.de/api/v1/videos/',
  'https://yewtu.be/api/v1/videos/',
];

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

// Simple fixed-window rate limiter per client IP so a single heavy user
// can't hammer the upstream oEmbed/Invidious APIs through this endpoint.
// In-memory like the cache: per-serverless-instance, which is fine for a
// soft abuse guard. (Add Redis/Upstash here if a hard global limit is needed.)
const RATE_LIMIT = 30; // requests per window per IP
const RATE_WINDOW_MS = 60_000;
const rateMap = new Map<string, { count: number; start: number }>();
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

/** Returns the number of seconds the client must wait when limited, else 0. */
function rateLimited(ip: string): number {
  const now = Date.now();
  const e = rateMap.get(ip);
  if (!e || now - e.start >= RATE_WINDOW_MS) {
    rateMap.set(ip, { count: 1, start: now });
    // Keep the map bounded on untrusted hosts.
    if (rateMap.size > 1000) {
      for (const [k, v] of rateMap) if (now - v.start >= RATE_WINDOW_MS) rateMap.delete(k);
    }
    return 0;
  }
  e.count += 1;
  return e.count > RATE_LIMIT ? Math.ceil((e.start + RATE_WINDOW_MS - now) / 1000) : 0;
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

async function fetchYouTube(platform: PlatformKey, rawUrl: string): Promise<VideoInfo> {
  const id = extractYouTubeId(rawUrl);
  const info: VideoInfo = { title: '', author: '', thumbnail: '', duration: '', views: '', published: '', platform };

  const oembedP = fetchOEmbed(`https://www.youtube.com/oembed?url=${encodeURIComponent(rawUrl)}&format=json`);
  // Try Invidious instances one at a time so a single dead/misbehaving
  // instance (throttled, down, slow) doesn't fail the whole lookup.
  const invidiousP = (async () => {
    if (!id) return null;
    for (const base of INVIDIOUS_INSTANCES) {
      try {
        const r = await fetch(`${base}${id}`, { headers: UA, signal: AbortSignal.timeout(5000) });
        if (r.ok) return (await r.json()) as Record<string, unknown>;
      } catch {
        // try the next instance
      }
    }
    return null;
  })();

  const [oembed, invidious] = await Promise.all([oembedP, invidiousP]);

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

async function fetchInfo(platform: PlatformKey, rawUrl: string): Promise<VideoInfo> {
  const info: VideoInfo = { title: '', author: '', thumbnail: '', duration: '', views: '', published: '', platform };

  if (platform === 'youtube' || platform === 'youtubemusic') {
    return fetchYouTube(platform, rawUrl);
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

const RESPONSE_HEADERS = { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' };

export async function GET(request: Request) {
  const ip =
    (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  const retryAfter = rateLimited(ip);
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
  if (!platform) return NextResponse.json({ error: 'Unsupported URL.' }, { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: 'Enter a full URL starting with https://' }, { status: 400 });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return NextResponse.json({ error: 'Only http(s) links are supported' }, { status: 400 });
  }
  if ((platform === 'youtube' || platform === 'youtubemusic') && !extractYouTubeId(rawUrl)) {
    return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
  }

  const captchaToken = request.headers.get('x-captcha-token') || '';
  if (!captchaToken || !(await verifyCaptchaToken(captchaToken, ip)) || captchaTokenAlreadyUsed(captchaToken)) {
    return NextResponse.json(
      { error: 'Complete the CAPTCHA before requesting media information.' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const cacheKey = `${platform}|${rawUrl}`;
  const cached = cacheGet(cacheKey);
  if (cached) return NextResponse.json(cached, { headers: RESPONSE_HEADERS });

  try {
    const info = await fetchInfo(platform, rawUrl);
    cacheSet(cacheKey, info);
    return NextResponse.json(info, { headers: RESPONSE_HEADERS });
  } catch (err) {
    console.error('[video-info] failed for', platform, err);
    return NextResponse.json({ error: 'Failed to fetch video info. Please try again.' }, { status: 500 });
  }
}
