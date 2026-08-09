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
  | 'amazonmusic'
  | 'tiktok'
  | 'facebook'
  | 'snapchat'
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
  'amazonmusic',
  'tiktok',
  'facebook',
  'snapchat',
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
  amazonmusic: 'Amazon Music',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  snapchat: 'Snapchat',
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
  amazonmusic: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  tiktok: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  facebook: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  snapchat: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
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
 *
 * Order matters: more specific hosts (music.youtube.com) must be checked
 * before their broader parent domains (youtube.com).
 */
export function detectPlatform(input: string): PlatformKey | null {
  const u = input.trim();
  if (!u) return null;
  // Must look like a URL (with scheme) or a bare domain before any matching.
  if (!/^https?:\/\//i.test(u) && !/^\w+\.\w{2,}/i.test(u)) return null;
  // Normalize to a bare host so subdomain checks are exact and we never match
  // lookalike domains such as "youtube.com.evil.com".
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
  // Amazon Music uses regional music.amazon.* domains (for example .com,
  // .co.uk and .de), and some shared links use amazon.*/music. Restrict the
  // latter to the /music path so ordinary Amazon shopping links are not media.
  const path = u.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
  if (
    /^music\.amazon\.[a-z.]+$/.test(host) ||
    (/^(?:www\.)?amazon\.[a-z.]+$/.test(host) && /^\/music(?:\/|$)/i.test(path))
  ) return 'amazonmusic';
  if (host === 'bereal.com' || host.endsWith('.bereal.com')) return 'br';
  return null;
}

/** Extract an 11-character YouTube video id from common URL shapes. */
export function extractYouTubeId(url: string): string | null {
  // Require a non-ID character (or end of string) after the 11-char id so a
  // longer run of ID characters can't false-match. Case-insensitive markers
  // handle URLs pasted with uppercase query keys (/WATCH?V=...).
  const m = url.match(/(?:v=|youtu\.be\/|shorts\/|live\/|embed\/|clip\/|\/v\/)([a-zA-Z0-9_-]{11})(?![\w-])/i);
  return m ? m[1] : null;
}
