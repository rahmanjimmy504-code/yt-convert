// Shared platform definitions used by both the client UI and the API route.
// Keeping this in one place prevents the two sides from drifting apart.

export type PlatformKey =
  | 'youtube' | 'youtubemusic' | 'soundcloud' | 'twitter' | 'instagram'
  | 'spotify' | 'deezer' | 'applemusic' | 'amazonmusic' | 'tiktok'
  | 'facebook' | 'snapchat' | 'br';

/** User-selectable output formats. */
export type FormatKey = 'flac' | 'mp3' | 'm4a' | 'aac' | 'opus' | 'mp4';

export const PLATFORM_KEYS: PlatformKey[] = [
  'youtube', 'youtubemusic', 'soundcloud', 'twitter', 'instagram', 'spotify',
  'deezer', 'applemusic', 'amazonmusic', 'tiktok', 'facebook', 'snapchat', 'br',
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
  const host = u.replace(/^https?:\/\//i, '').split(/[/?#]/)[0].toLowerCase();
  if (host === 'music.youtube.com') return 'youtubemusic';
  if (host === 'youtube.com' || host === 'youtu.be' || host === 'm.youtube.com' || host === 'youtube-nocookie.com' || host.endsWith('.youtube.com') || host.endsWith('.youtu.be') || host.endsWith('.youtube-nocookie.com')) return 'youtube';
  if (host === 'soundcloud.com' || host.endsWith('.soundcloud.com')) return 'soundcloud';
  if (host === 'twitter.com' || host === 'x.com' || host.endsWith('.twitter.com') || host.endsWith('.x.com')) return 'twitter';
  if (host === 'instagram.com' || host === 'instagr.am' || host.endsWith('.instagram.com')) return 'instagram';
  if (host === 'spotify.com' || host === 'open.spotify.com' || host === 'play.spotify.com' || host.endsWith('.spotify.com')) return 'spotify';
  if (host === 'deezer.com' || host === 'deezer.page.link' || host.endsWith('.deezer.com')) return 'deezer';
  if (host === 'facebook.com' || host === 'fb.watch' || host.endsWith('.facebook.com')) return 'facebook';
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'tiktok';
  if (host === 'snapchat.com' || host === 'story.snapchat.com' || host === 't.snapchat.com' || host === 'w.snapchat.com' || host.endsWith('.snapchat.com')) return 'snapchat';
  if (host === 'music.apple.com' || host === 'itunes.apple.com' || host === 'geo.itunes.apple.com') return 'applemusic';
  const path = u.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
  if (/^music\.amazon\.[a-z.]+$/.test(host) || (/^(?:www\.)?amazon\.[a-z.]+$/.test(host) && /^\/music(?:\/|$)/i.test(path))) return 'amazonmusic';
  if (host === 'bereal.com' || host.endsWith('.bereal.com')) return 'br';
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
  return m ? m[1] : null;
}
