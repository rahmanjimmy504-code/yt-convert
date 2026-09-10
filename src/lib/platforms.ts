// Shared platform definitions used by both the client UI and the API route.
// Keeping this in one place prevents the two sides from drifting apart.

export type PlatformKey =
  | 'youtube' | 'youtubemusic' | 'soundcloud' | 'twitter' | 'instagram'
  | 'spotify' | 'deezer' | 'applemusic' | 'amazonmusic' | 'tiktok'
  | 'facebook' | 'snapchat' | 'br';

/** User-selectable output formats. */
export type FormatKey = 'flac' | 'mp3' | 'm4a' | 'aac' | 'opus' | 'mp4';

export const PLATFORM_KEYS: PlatformKey[] = [
  'youtube', 'youtubemusic', 'soundcloud', 'twitter', 'instagram',
  'spotify', 'deezer', 'applemusic', 'amazonmusic', 'tiktok', 'facebook', 'snapchat', 'br',
];

export const PLATFORM_LABELS: Record<PlatformKey, string> = {
  youtube: 'YouTube', youtubemusic: 'YT Music', soundcloud: 'SoundCloud', twitter: 'X',
  instagram: 'Instagram', spotify: 'Spotify', deezer: 'Deezer', applemusic: 'Apple Music',
  amazonmusic: 'Amazon Music', tiktok: 'TikTok', facebook: 'Facebook', snapchat: 'Snapchat', br: 'BeReal',
};

export const PLATFORM_COLORS: Record<PlatformKey, string> = {
  youtube: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  youtubemusic: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  soundcloud: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  twitter: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  instagram: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  spotify: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  deezer: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  applemusic: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  amazonmusic: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  tiktok: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  facebook: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  snapchat: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  br: 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900',
};

const DEFAULT_COLOR = 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
export function platformLabel(p: string): string { return (PLATFORM_LABELS as Record<string, string>)[p] || ''; }
export function platformColor(p: string): string { return (PLATFORM_COLORS as Record<string, string>)[p] || DEFAULT_COLOR; }

export function detectPlatform(input: string): PlatformKey | null {
  const u = input.trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u) && !/^\w+\.\w{2,}/i.test(u)) return null;
  const host = u.replace(/^https?:\/\//i, '').split(/[/?#]/)[0] ?? '';
  const normalizedHost = host.toLowerCase();
  if (normalizedHost === 'music.youtube.com') return 'youtubemusic';
  if (normalizedHost === 'youtube.com' || normalizedHost === 'youtu.be' || normalizedHost === 'm.youtube.com' || normalizedHost === 'youtube-nocookie.com' || normalizedHost.endsWith('.youtube.com') || normalizedHost.endsWith('.youtu.be') || normalizedHost.endsWith('.youtube-nocookie.com')) return 'youtube';
  if (normalizedHost === 'soundcloud.com' || normalizedHost.endsWith('.soundcloud.com')) return 'soundcloud';
  if (normalizedHost === 'twitter.com' || normalizedHost === 'x.com' || normalizedHost.endsWith('.twitter.com') || normalizedHost.endsWith('.x.com')) return 'twitter';
  if (normalizedHost === 'instagram.com' || normalizedHost === 'instagr.am' || normalizedHost.endsWith('.instagram.com')) return 'instagram';
  if (normalizedHost === 'spotify.com' || normalizedHost === 'open.spotify.com' || normalizedHost === 'play.spotify.com' || normalizedHost.endsWith('.spotify.com')) return 'spotify';
  if (normalizedHost === 'deezer.com' || normalizedHost === 'deezer.page.link' || normalizedHost.endsWith('.deezer.com')) return 'deezer';
  if (normalizedHost === 'facebook.com' || normalizedHost === 'fb.watch' || normalizedHost.endsWith('.facebook.com')) return 'facebook';
  if (normalizedHost === 'tiktok.com' || normalizedHost.endsWith('.tiktok.com')) return 'tiktok';
  if (normalizedHost === 'snapchat.com' || normalizedHost === 'story.snapchat.com' || normalizedHost === 't.snapchat.com' || normalizedHost === 'w.snapchat.com' || normalizedHost.endsWith('.snapchat.com')) return 'snapchat';
  if (normalizedHost === 'music.apple.com' || normalizedHost === 'itunes.apple.com' || normalizedHost === 'geo.itunes.apple.com') return 'applemusic';
  const path = u.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0] ?? '';
  if (/^music\.amazon\.[a-z.]+$/.test(normalizedHost) || (/^(?:www\.)?amazon\.[a-z.]+$/.test(normalizedHost) && /^\/music(?:\/|$)/i.test(path))) return 'amazonmusic';
  if (normalizedHost === 'bereal.com' || normalizedHost.endsWith('.bereal.com')) return 'br';
  return null;
}

export function canConvertPlatform(platform: PlatformKey): boolean {
  switch (platform) {
    case 'youtube': case 'youtubemusic': case 'soundcloud': case 'twitter': case 'instagram': case 'tiktok': case 'facebook': return true;
    default: return false;
  }
}

export function convertUnavailableReason(platform: PlatformKey): string {
  switch (platform) {
    case 'spotify': return 'Spotify catalog tracks are DRM-protected (preview only / use a licensed downloader).';
    case 'deezer': return 'Deezer catalog tracks are DRM-protected (preview only / use a licensed downloader).';
    case 'applemusic': return 'Apple Music uses FairPlay DRM (preview only / use a licensed downloader).';
    case 'amazonmusic': return 'Amazon Music catalog tracks are DRM-protected (preview only / use a licensed downloader).';
    case 'snapchat': return 'Snapchat does not expose a public media file we can proxy.';
    case 'br': return 'BeReal posts are not available as public downloadable files.';
    default: return '';
  }
}

export function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:v=|youtu\.be\/|shorts\/|live\/|embed\/|clip\/|\/v\/)([a-zA-Z0-9_-]{11})(?![\w-])/i);
  return m?.[1] ?? null;
}
