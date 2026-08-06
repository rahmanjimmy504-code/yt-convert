import { NextResponse } from 'next/server';
import { detectPlatform, extractYouTubeId, type PlatformKey } from '@/lib/platforms';

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

  if (oembed.title) info.title = String(oembed.title);
  if (oembed.author_name) info.author = String(oembed.author_name);
  if (oembed.thumbnail_url) info.thumbnail = String(oembed.thumbnail_url);

  if (invidious) {
    const d = invidious;
    if (typeof d.lengthSeconds === 'number') info.duration = formatDuration(d.lengthSeconds);
    if (typeof d.viewCount === 'number') info.views = formatCount(d.viewCount);
    if (typeof d.published === 'number') info.published = formatDate(d.published);
    if (!info.title && d.title) info.title = String(d.title);
    if (!info.author && d.author) info.author = String(d.author);
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
    if (d.title) info.title = String(d.title);
    if (d.author_name) info.author = String(d.author_name);
    if (d.thumbnail_url) info.thumbnail = String(d.thumbnail_url);
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

export async function GET(request: Request) {
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

  const cacheKey = `${platform}|${rawUrl}`;
  const cached = cacheGet(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    const info = await fetchInfo(platform, rawUrl);
    cacheSet(cacheKey, info);
    return NextResponse.json(info, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (err) {
    console.error('[video-info] failed for', platform, err);
    return NextResponse.json({ error: 'Failed to fetch video info. Please try again.' }, { status: 500 });
  }
}
