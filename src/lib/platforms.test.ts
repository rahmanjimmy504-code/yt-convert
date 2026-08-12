import { describe, expect, it } from 'vitest';
import {
  PLATFORM_KEYS,
  canConvertPlatform,
  convertUnavailableReason,
  detectPlatform,
  extractYouTubeId,
  platformColor,
  platformLabel,
  type PlatformKey,
} from './platforms';

describe('detectPlatform', () => {
  it('returns null for empty input', () => {
    expect(detectPlatform('')).toBeNull();
    expect(detectPlatform('   ')).toBeNull();
  });

  it('returns null for text that is not a URL or domain', () => {
    expect(detectPlatform('hello world')).toBeNull();
    expect(detectPlatform('watch?v=abc')).toBeNull();
    expect(detectPlatform('youtube')).toBeNull();
  });

  it('detects standard YouTube watch URLs', () => {
    expect(detectPlatform('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('youtube');
    expect(detectPlatform('https://youtube.com/watch?v=dQw4w9WgXcQ')).toBe('youtube');
    expect(detectPlatform('http://youtube.com/watch?v=dQw4w9WgXcQ')).toBe('youtube');
  });

  it('detects youtu.be short links with and without query params', () => {
    expect(detectPlatform('https://youtu.be/dQw4w9WgXcQ')).toBe('youtube');
    expect(detectPlatform('https://youtu.be/dQw4w9WgXcQ?t=42')).toBe('youtube');
  });

  it('detects YouTube Music before plain YouTube', () => {
    expect(detectPlatform('https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('youtubemusic');
  });

  it('detects mobile and no-cookie YouTube hosts', () => {
    expect(detectPlatform('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('youtube');
    expect(detectPlatform('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')).toBe('youtube');
  });

  it('detects subdomains but not lookalike domains', () => {
    expect(detectPlatform('https://music.youtube.com/watch?v=id')).toBe('youtubemusic');
    expect(detectPlatform('https://youtube.com.evil.example/watch?v=id')).toBeNull();
    expect(detectPlatform('https://notyoutube.com/watch?v=id')).toBeNull();
    expect(detectPlatform('https://youtube.com.ua/')).toBeNull();
  });

  it('detects SoundCloud', () => {
    expect(detectPlatform('https://soundcloud.com/artist/track')).toBe('soundcloud');
    expect(detectPlatform('https://m.soundcloud.com/artist/track')).toBe('soundcloud');
  });

  it('detects X/Twitter', () => {
    expect(detectPlatform('https://twitter.com/user/status/123')).toBe('twitter');
    expect(detectPlatform('https://x.com/user/status/123')).toBe('twitter');
    expect(detectPlatform('https://mobile.twitter.com/user/status/123')).toBe('twitter');
  });

  it('detects Instagram', () => {
    expect(detectPlatform('https://www.instagram.com/reel/abc/')).toBe('instagram');
    expect(detectPlatform('https://instagr.am/p/abc/')).toBe('instagram');
  });

  it('detects Spotify', () => {
    expect(detectPlatform('https://open.spotify.com/track/123')).toBe('spotify');
    expect(detectPlatform('https://play.spotify.com/track/123')).toBe('spotify');
  });

  it('detects Deezer', () => {
    expect(detectPlatform('https://www.deezer.com/track/123')).toBe('deezer');
    expect(detectPlatform('https://deezer.page.link/abc')).toBe('deezer');
  });

  it('detects Facebook and TikTok', () => {
    expect(detectPlatform('https://www.facebook.com/watch/?v=123')).toBe('facebook');
    expect(detectPlatform('https://fb.watch/abc/')).toBe('facebook');
    expect(detectPlatform('https://www.tiktok.com/@user/video/123')).toBe('tiktok');
  });

  it('detects Snapchat', () => {
    expect(detectPlatform('https://www.snapchat.com/add/user')).toBe('snapchat');
    expect(detectPlatform('https://story.snapchat.com/p/abc')).toBe('snapchat');
    expect(detectPlatform('https://t.snapchat.com/abc')).toBe('snapchat');
  });

  it('detects Apple Music, Amazon Music and BeReal', () => {
    expect(detectPlatform('https://music.apple.com/us/album/name/123')).toBe('applemusic');
    expect(detectPlatform('https://itunes.apple.com/us/album/name/123')).toBe('applemusic');
    expect(detectPlatform('https://music.amazon.com/albums/B012345678')).toBe('amazonmusic');
    expect(detectPlatform('https://music.amazon.co.uk/albums/B012345678')).toBe('amazonmusic');
    expect(detectPlatform('https://www.amazon.com/music/player/albums/B012345678')).toBe('amazonmusic');
    expect(detectPlatform('https://www.amazon.com/gp/product/B012345678')).toBeNull();
    expect(detectPlatform('https://www.bereal.com/post/abc')).toBe('br');
  });

  it('accepts bare domains without a scheme', () => {
    expect(detectPlatform('youtube.com/watch?v=dQw4w9WgXcQ')).toBe('youtube');
    expect(detectPlatform('open.spotify.com/track/123')).toBe('spotify');
  });

  it('is case-insensitive for scheme and host', () => {
    expect(detectPlatform('HTTPS://WWW.YOUTUBE.COM/WATCH?V=dQw4w9WgXcQ')).toBe('youtube');
    expect(detectPlatform('https://SoundCloud.com/artist/track')).toBe('soundcloud');
  });

  it('returns null for unknown hosts', () => {
    expect(detectPlatform('https://example.com/video')).toBeNull();
    expect(detectPlatform('https://vimeo.com/123')).toBeNull();
  });
});

describe('extractYouTubeId', () => {
  it('extracts ids from watch URLs', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('extracts ids from youtu.be short links', () => {
    expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ?t=42')).toBe('dQw4w9WgXcQ');
  });

  it('extracts ids from shorts, live, embed, clip and /v/ shapes', () => {
    expect(extractYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeId('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeId('https://www.youtube.com/clip/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeId('https://www.youtube.com/v/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('handles uppercase query keys', () => {
    expect(extractYouTubeId('https://www.youtube.com/WATCH?V=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('stops at non-id characters such as ampersands', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s')).toBe('dQw4w9WgXcQ');
  });

  it('returns null for ids with the wrong length', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch?v=abc')).toBeNull();
    expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQExtra')).toBeNull();
  });

  it('does not match a longer run of id characters', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQzz')).toBeNull();
  });

  it('returns null when no video marker is present', () => {
    expect(extractYouTubeId('https://www.youtube.com/user/name')).toBeNull();
    expect(extractYouTubeId('https://www.youtube.com/results?search_query=dQw4w9WgXcQ')).toBeNull();
  });

  it('extracts purely by marker, without checking the host (host checks live in detectPlatform)', () => {
    expect(extractYouTubeId('https://example.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
});

describe('canConvertPlatform', () => {
  const expected: Record<PlatformKey, boolean> = {
    youtube: true,
    youtubemusic: true,
    soundcloud: true,
    twitter: true,
    instagram: true,
    tiktok: true,
    facebook: true,
    spotify: false,
    deezer: false,
    applemusic: false,
    amazonmusic: false,
    snapchat: false,
    br: false,
  };

  it('matches the exact capability map so DRM platforms cannot silently become true', () => {
    expect([...PLATFORM_KEYS].sort()).toEqual(Object.keys(expected).sort());
    for (const key of PLATFORM_KEYS) {
      expect(canConvertPlatform(key)).toBe(expected[key]);
    }
  });

  it('explains every non-convertible platform', () => {
    for (const key of PLATFORM_KEYS) {
      if (!canConvertPlatform(key)) {
        expect(convertUnavailableReason(key).length).toBeGreaterThan(10);
      } else {
        expect(convertUnavailableReason(key)).toBe('');
      }
    }
    expect(convertUnavailableReason('spotify')).toMatch(/DRM/i);
    expect(convertUnavailableReason('applemusic')).toMatch(/FairPlay|DRM/i);
  });
});

describe('platform label/color helpers', () => {
  it('returns a label for known platforms and empty for unknown', () => {
    expect(platformLabel('youtube')).toBe('YouTube');
    expect(platformLabel('amazonmusic')).toBe('Amazon Music');
    expect(platformLabel('not-a-platform')).toBe('');
  });

  it('returns a color class for known platforms and a default otherwise', () => {
    expect(platformColor('youtube')).toContain('bg-red');
    expect(platformColor('amazonmusic')).toContain('bg-sky');
    expect(platformColor('unknown')).toContain('bg-gray');
  });
});
