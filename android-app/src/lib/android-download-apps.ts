// SPDX-License-Identifier: GPL-3.0-or-later
// Free Android download apps surfaced while on-device extraction is still in
// flight. These are not hosted APIs: the phone receives the original YouTube
// URL and the chosen app makes its own request over the visitor's connection.

export interface AndroidDownloadApp {
  name: 'Seal' | 'YTDLnis' | 'NewPipe';
  packageName: string;
  installUrl: string;
  description: string;
}

export const ANDROID_DOWNLOAD_APPS: readonly AndroidDownloadApp[] = [
  {
    name: 'Seal',
    packageName: 'com.junkfood.seal',
    installUrl: 'https://f-droid.org/packages/com.junkfood.seal/',
    description: 'yt-dlp audio and video downloader',
  },
  {
    name: 'YTDLnis',
    packageName: 'com.deniscerri.ytdl',
    installUrl: 'https://deniscerri.github.io/ytdlnis/',
    description: 'full-featured yt-dlp downloader',
  },
  {
    name: 'NewPipe',
    packageName: 'org.schabi.newpipe',
    installUrl: 'https://newpipe.net/#download',
    description: 'YouTube video and audio downloader',
  },
] as const;

/**
 * Build a package-targeted Android VIEW intent. When the named app is
 * installed it is opened with the URL; otherwise the browser follows the
 * official browser_fallback_url. No command/options extras are attached.
 */
export function buildAndroidDownloadIntent(
  app: AndroidDownloadApp,
  mediaUrl: string,
): string | null {
  if (!mediaUrl || mediaUrl.length > 2048) return null;
  try {
    const parsed = new URL(mediaUrl);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    const target = `${parsed.host}${parsed.pathname}${parsed.search}`;
    return (
      `intent://${target}` +
      '#Intent;scheme=https;action=android.intent.action.VIEW;' +
      `package=${app.packageName};` +
      `S.browser_fallback_url=${encodeURIComponent(app.installUrl)};end`
    );
  } catch {
    return null;
  }
}
