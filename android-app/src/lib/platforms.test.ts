/*
 * YT Convert for Android — GPLv3 companion app.
 * Copyright (C) 2026 rahmanjimmy504-code
 * Licensed under the GNU General Public License v3 or later.
 */

import { describe, expect, it } from 'vitest';
import { canConvertPlatform, detectPlatform, extractYouTubeId, platformLabel } from './platforms';
import { buildAndroidDownloadIntent, ANDROID_DOWNLOAD_APPS } from './android-download-apps';
import { getEmbed } from './embed';

describe('detectPlatform', () => {
  it('matches music.youtube.com before youtube.com', () => {
    expect(detectPlatform('https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('youtubemusic');
    expect(detectPlatform('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('youtube');
  });

  it('rejects lookalike domains', () => {
    expect(detectPlatform('https://youtube.com.evil.example/watch?v=x')).toBeNull();
  });

  it('ignores plain text', () => {
    expect(detectPlatform('not a link')).toBeNull();
  });
});

describe('extractYouTubeId', () => {
  it('reads ids from watch, youtu.be and shorts URLs', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
});

describe('platform capability', () => {
  it('never claims DRM catalogues are convertible', () => {
    for (const platform of ['spotify', 'deezer', 'applemusic', 'amazonmusic'] as const) {
      expect(canConvertPlatform(platform)).toBe(false);
    }
  });

  it('labels every supported platform', () => {
    expect(platformLabel('youtubemusic')).toBe('YT Music');
    expect(platformLabel('br')).toBe('BeReal');
  });
});

describe('android handoff', () => {
  it('builds a package-targeted intent with an install fallback', () => {
    const intent = buildAndroidDownloadIntent(ANDROID_DOWNLOAD_APPS[0], 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(intent).toContain('intent://www.youtube.com/watch');
    expect(intent).toContain('package=com.junkfood.seal');
    expect(intent).toContain('S.browser_fallback_url=');
  });

  it('refuses non-https URLs', () => {
    expect(buildAndroidDownloadIntent(ANDROID_DOWNLOAD_APPS[0], 'http://example.com/x')).toBeNull();
  });
});

describe('preview embeds', () => {
  it('uses the privacy-enhanced YouTube host', () => {
    expect(getEmbed('youtube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')?.url).toContain(
      'youtube-nocookie.com/embed/',
    );
  });

  it('returns null for platforms without an embed', () => {
    expect(getEmbed('snapchat', 'https://www.snapchat.com/add/someone')).toBeNull();
  });
});
