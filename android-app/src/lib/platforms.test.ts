// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  PLATFORM_KEYS,
  canConvertPlatform,
  canExtractOnDevice,
  convertUnavailableReason,
  detectPlatform,
  extractYouTubeId,
  platformColor,
  platformLabel,
  type PlatformKey,
} from './platforms';

describe('canExtractOnDevice', () => {
  it('is true only for the platforms the native extractor handles in this release', () => {
    expect(canExtractOnDevice('youtube')).toBe(true);
    expect(canExtractOnDevice('youtubemusic')).toBe(true);
  });

  it('is false for every other platform — even convertible ones', () => {
    const rest = PLATFORM_KEYS.filter(p => p !== 'youtube' && p !== 'youtubemusic');
    for (const p of rest) expect(canExtractOnDevice(p)).toBe(false);
  });

  it('never claims extraction for DRM catalogs', () => {
    for (const p of ['spotify', 'deezer', 'applemusic', 'amazonmusic'] as PlatformKey[]) {
      expect(canConvertPlatform(p)).toBe(false);
      expect(canExtractOnDevice(p)).toBe(false);
    }
  });
});

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

  it('detects subdomains but not lookalike domains', () => {
    expect(detectPlatform('https://music.youtube.com/watch?v=id')).toBe('youtubemusic');
    expect(detectPlatform('https://youtube.com.evil.example/watch?v=id')).toBeNull();
    expect(detectPlatform('https://notyoutube.com/watch?v=id')).toBeNull();
  });

  it('detects SoundCloud, X/Twitter and Instagram', () => {
    expect(detectPlatform('https://soundcloud.com/artist/track')).toBe('soundcloud');
    expect(detectPlatform('https://x.com/user/status/123')).toBe('twitter');
    expect(detectPlatform('https://www.instagram.com/reel/abc/')).toBe('instagram');
  });

  it('detects DRM catalog platforms', () => {
    expect(detectPlatform('https://open.spotify.com/track/123')).toBe('spotify');
    expect(detectPlatform('https://www.deezer.com/track/123')).toBe('deezer');
    expect(detectPlatform('https://music.apple.com/us/album/name/123')).toBe('applemusic');
    expect(detectPlatform('https://music.amazon.com/albums/B012345678')).toBe('amazonmusic');
    expect(detectPlatform('https://www.snapchat.com/add/user')).toBe('snapchat');
    expect(detectPlatform('https://www.bereal.com/post/abc')).toBe('br');
  });

  it('accepts bare domains without a scheme', () => {
    expect(detectPlatform('youtube.com/watch?v=dQw4w9WgXcQ')).toBe('youtube');
    expect(detectPlatform('open.spotify.com/track/123')).toBe('spotify');
  });

  it('returns null for unknown hosts', () => {
    expect(detectPlatform('https://example.com/video')).toBeNull();
    expect(detectPlatform('https://vimeo.com/123')).toBeNull();
  });
});

describe('extractYouTubeId', () => {
  it('extracts ids from watch URLs and youtu.be short links', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ?t=42')).toBe('dQw4w9WgXcQ');
  });

  it('extracts ids from shorts, live, embed and clip shapes', () => {
    expect(extractYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeId('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeId('https://www.youtube.com/clip/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('stops at non-id characters such as ampersands', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s')).toBe('dQw4w9WgXcQ');
  });

  it('returns null for ids with the wrong length', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch?v=abc')).toBeNull();
    expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQExtra')).toBeNull();
  });

  it('returns null when no video marker is present', () => {
    expect(extractYouTubeId('https://www.youtube.com/results?search_query=dQw4w9WgXcQ')).toBeNull();
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
