// Native player embed URLs for platforms that offer one. Used by the
// "Preview" toggle on the ready card so users can watch/listen before
// picking a converter.
//
// Like the rest of the metadata pipeline this is purely a routing aid: the
// embed is loaded straight from the platform's own embed endpoint in an
// iframe, so nothing is proxied or downloaded by this site.

import { extractYouTubeId, type PlatformKey } from './platforms';

export type EmbedKind = 'video' | 'audio' | 'tiktok';

export interface EmbedInfo {
  url: string;
  kind: EmbedKind;
}

/**
 * SoundCloud's player accepts canonical soundcloud.com track URLs, but rejects
 * otherwise-valid links from its mobile and sharing subdomains. Normalize only
 * the known first-party aliases and leave the path, query, and hash untouched.
 */
function canonicalSoundCloudUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

    const host = parsed.hostname.toLowerCase();
    if (!['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com', 'on.soundcloud.com'].includes(host)) {
      return null;
    }

    parsed.hostname = 'soundcloud.com';
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Return an embeddable player for a supported link, or null when the
 * platform (or the specific URL shape) has no embed. Only http(s) URLs
 * are ever wrapped, mirroring the API route's validation.
 */
export function getEmbed(platform: PlatformKey, rawUrl: string): EmbedInfo | null {
  const u = rawUrl.trim();
  if (!/^https?:\/\//i.test(u)) return null;

  switch (platform) {
    case 'youtube':
    case 'youtubemusic': {
      const id = extractYouTubeId(u);
      // youtube-nocookie.com is YouTube's privacy-enhanced embed host.
      return id ? { url: `https://www.youtube-nocookie.com/embed/${id}`, kind: 'video' } : null;
    }
    case 'soundcloud': {
      const canonical = canonicalSoundCloudUrl(u);
      // Only user/track style pages are playable; bare profiles and short
      // on.soundcloud.com share links do not identify a track for the widget.
      if (!canonical || canonical.pathname.split('/').filter(Boolean).length < 2) return null;
      return {
        url: `https://w.soundcloud.com/player/?url=${encodeURIComponent(canonical.toString())}&visual=true&show_teaser=false`,
        kind: 'audio',
      };
    }
    case 'spotify': {
      // open.spotify.com/{type}/{id} maps 1:1 onto open.spotify.com/embed/{type}/{id}.
      const m = u.match(/open\.spotify\.com\/(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]+)/i);
      if (!m) return null;
      return { url: `https://open.spotify.com/embed/${m[1].toLowerCase()}/${m[2]}`, kind: 'audio' };
    }
    case 'tiktok': {
      // TikTok's v2 embed needs the numeric video id from /@user/video/<id>.
      const m = u.match(/\/video\/(\d+)/);
      return m ? { url: `https://www.tiktok.com/embed/v2/${m[1]}`, kind: 'tiktok' } : null;
    }
    default:
      return null;
  }
}
