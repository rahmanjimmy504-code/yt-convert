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

// Small in-memory cache to avoid hammering upstream oEmbed/Invidious APIs.
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;
const cache = new Map<string, { at: number; body: VideoInfo }>();

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

async function fetchYouTube(platform: PlatformKey, rawUrl: string): Promise<VideoInfo> {
  const id = extractYouTubeId(rawUrl);
  const info: VideoInfo = { title: '', author: '', thumbnail: '', duration: '', views: '', published: '', platform };

  const [oembed, invidious] = await Promise.allSettled([
    fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(rawUrl)}&format=json`, {
      headers: UA,
      signal: AbortSignal.timeout(6000),
    }),
    id
      ? fetch(`https://inv.nadeko.net/api/v1/videos/${id}`, { headers: UA, signal: AbortSignal.timeout(5000) })
      : Promise.reject(new Error('no id')),
  ]);

  if (oembed.status === 'fulfilled' && oembed.value.ok) {
    try {
      const d = await oembed.value.json();
      info.title = d.title || '';
      info.author = d.author_name || '';
      info.thumbnail = d.thumbnail_url || '';
    } catch {
      // fall back to Invidious data below
    }
  }
  if (invidious.status === 'fulfilled' && invidious.value.ok) {
    try {
      const d = await invidious.value.json();
      if (d.lengthSeconds) info.duration = formatDuration(d.lengthSeconds);
      if (d.viewCount) info.views = formatCount(d.viewCount);
      if (d.published) info.published = formatDate(d.published);
      if (!info.title) info.title = d.title || '';
      if (!info.author) info.author = d.author || '';
    } catch {
      // partial data is fine
    }
  }
  return info;
}

async function fetchInfo(platform: PlatformKey, rawUrl: string): Promise<VideoInfo> {
  const info: VideoInfo = { title: '', author: '', thumbnail: '', duration: '', views: '', published: '', platform };

  if (platform === 'youtube' || platform === 'youtubemusic') {
    return fetchYouTube(platform, rawUrl);
  }

  if (platform === 'spotify') {
    info.title = 'Spotify Track';
    info.author = 'Spotify';
    return info;
  }
  if (platform === 'deezer') {
    info.title = 'Deezer Track';
    info.author = 'Deezer';
    return info;
  }
  if (platform === 'applemusic') {
    info.title = 'Apple Music Track';
    info.author = 'Apple Music';
    return info;
  }
  if (platform === 'br') {
    info.title = 'BeReal Post';
    info.author = 'BeReal User';
    return info;
  }
  if (platform === 'tiktok') {
    // TikTok exposes a public oEmbed endpoint; degrade to placeholders if it fails.
    try {
      const r = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(rawUrl)}`, {
        headers: UA,
        signal: AbortSignal.timeout(6000),
      });
      if (r.ok) {
        const d = await r.json();
        info.title = d.title || 'TikTok Video';
        info.author = d.author_name || 'TikTok';
        info.thumbnail = d.thumbnail_url || '';
        return info;
      }
    } catch {
      // fall through to placeholder
    }
    info.title = 'TikTok Video';
    info.author = 'TikTok';
    return info;
  }
  if (platform === 'facebook') {
    info.title = 'Facebook Video';
    info.author = 'Facebook';
    return info;
  }

  // oEmbed-capable platforms (SoundCloud, X, Instagram).
  const oembedUrl =
    platform === 'soundcloud'
      ? `https://soundcloud.com/oembed?url=${encodeURIComponent(rawUrl)}&format=json`
      : platform === 'twitter'
        ? `https://publish.twitter.com/oembed?url=${encodeURIComponent(rawUrl)}&format=json`
        : platform === 'instagram'
          ? `https://www.instagram.com/oembed?url=${encodeURIComponent(rawUrl)}`
          : '';

  if (oembedUrl) {
    try {
      const r = await fetch(oembedUrl, { headers: UA, signal: AbortSignal.timeout(6000) });
      if (r.ok) {
        const d = await r.json();
        info.title = d.title || (platform === 'twitter' ? `${d.author_name || ''} on X` : '');
        info.author = d.author_name || '';
        info.thumbnail = d.thumbnail_url || '';
      }
    } catch {
      // fall through to placeholders
    }
  }

  if (!info.title) {
    info.title =
      platform === 'soundcloud' ? 'SoundCloud Track' : platform === 'twitter' ? 'X Post' : 'Instagram Post';
  }
  if (!info.author) info.author = platform === 'twitter' ? 'X' : '';
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
