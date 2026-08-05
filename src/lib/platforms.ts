// Shared platform definitions used by both the client UI and the API route.
// Keeping this in one place prevents the two sides from drifting apart.

export type PlatformKey =
  | 'youtube'
  | 'youtubemusic'
  | 'soundcloud'
  | 'twitter'
  | 'instagram'
  | 'spotify'
  | 'deezer'
  | 'applemusic'
  | 'tiktok'
  | 'facebook'
  | 'br';

export type FormatKey = 'mp3' | 'mp4';

export const PLATFORM_KEYS: PlatformKey[] = [
  'youtube',
  'youtubemusic',
  'soundcloud',
  'twitter',
  'instagram',
  'spotify',
  'deezer',
  'applemusic',
  'tiktok',
  'facebook',
  'br',
];

export const PLATFORM_LABELS: Record<PlatformKey, string> = {
  youtube: 'YouTube',
  youtubemusic: 'YT Music',
  soundcloud: 'SoundCloud',
  twitter: 'X',
  instagram: 'Instagram',
  spotify: 'Spotify',
  deezer: 'Deezer',
  applemusic: 'Apple Music',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  br: 'BeReal',
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
  tiktok: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  facebook: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  br: 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900',
};

const DEFAULT_COLOR = 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';

export function platformLabel(p: string): string {
  return (PLATFORM_LABELS as Record<string, string>)[p] || '';
}

export function platformColor(p: string): string {
  return (PLATFORM_COLORS as Record<string, string>)[p] || DEFAULT_COLOR;
}

/**
 * Detect which supported platform a pasted link belongs to.
 * Accepts full URLs ("https://youtu.be/...") as well as bare domains
 * ("youtube.com") typed without a scheme.
 */
export function detectPlatform(input: string): PlatformKey | null {
  const u = input.trim();
  if (!u) return null;
  // Must look like a URL (with scheme) or a bare domain before any matching.
  if (!/^https?:\/\//i.test(u) && !/^\w+\.\w{2,}/i.test(u)) return null;
  if (/music\.youtube\.com/i.test(u)) return 'youtubemusic';
  if (/youtu\.?be|youtube\.com/i.test(u)) return 'youtube';
  if (/soundcloud\.com/i.test(u)) return 'soundcloud';
  if (/twitter\.com|x\.com/i.test(u)) return 'twitter';
  if (/instagram\.com/i.test(u)) return 'instagram';
  if (/spotify\.com|open\.spotify\.com/i.test(u)) return 'spotify';
  if (/deezer\.com/i.test(u)) return 'deezer';
  if (/facebook\.com|fb\.watch/i.test(u)) return 'facebook';
  if (/tiktok\.com/i.test(u)) return 'tiktok';
  if (/music\.apple\.com/i.test(u)) return 'applemusic';
  if (/bereal\.com/i.test(u)) return 'br';
  return null;
}

/** Extract an 11-character YouTube video id from common URL shapes. */
export function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:v=|youtu\.be\/|shorts\/|live\/|embed\/|clip\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}
