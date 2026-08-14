import { describe, expect, it } from 'vitest';
import { ANDROID_DOWNLOAD_APPS, buildAndroidDownloadIntent } from './android-download-apps';

describe('Android download apps', () => {
  it('lists the three requested apps with official HTTPS install pages', () => {
    expect(ANDROID_DOWNLOAD_APPS.map(app => app.name)).toEqual(['Seal', 'YTDLnis', 'NewPipe']);
    expect(ANDROID_DOWNLOAD_APPS.map(app => app.packageName)).toEqual([
      'com.junkfood.seal',
      'com.deniscerri.ytdl',
      'org.schabi.newpipe',
    ]);
    for (const app of ANDROID_DOWNLOAD_APPS) {
      expect(app.installUrl).toMatch(/^https:\/\//);
    }
  });

  it('targets an installed package and retains the exact YouTube URL', () => {
    const app = ANDROID_DOWNLOAD_APPS[1];
    const intent = buildAndroidDownloadIntent(
      app,
      'https://www.youtube.com/watch?v=jNQXAC9IVRw',
    );

    expect(intent).toBe(
      'intent://www.youtube.com/watch?v=jNQXAC9IVRw' +
      '#Intent;scheme=https;action=android.intent.action.VIEW;' +
      'package=com.deniscerri.ytdl;' +
      `S.browser_fallback_url=${encodeURIComponent(app.installUrl)};end`,
    );
  });

  it('rejects non-HTTPS, credentialed, malformed, and oversized links', () => {
    const app = ANDROID_DOWNLOAD_APPS[0];
    expect(buildAndroidDownloadIntent(app, 'http://www.youtube.com/watch?v=jNQXAC9IVRw')).toBeNull();
    expect(buildAndroidDownloadIntent(app, 'https://user:pass@example.com/video')).toBeNull();
    expect(buildAndroidDownloadIntent(app, 'not a URL')).toBeNull();
    expect(buildAndroidDownloadIntent(app, `https://example.com/${'a'.repeat(2050)}`)).toBeNull();
  });
});
