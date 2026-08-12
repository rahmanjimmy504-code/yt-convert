import { type FormatKey, type PlatformKey, extractYouTubeId } from './platforms';
import { INVIDIOUS_INSTANCES, invidiousVideoUrl } from './invidious';
import { isAllowedMediaUrl } from './media-hosts';
import {
  extensionForMime,
  pickYouTubeFormat,
  type PlayerFormat,
} from './youtube-formats';

export interface ExtractedMedia {
  url: string;
  mimeType: string;
  extension: string;
  qualityLabel?: string;
  /** TikTok: true when the official play URL still has a watermark. */
  watermarked?: boolean;
  note?: string;
}

export type ExtractResult = ExtractedMedia | { error: string };

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const PLAYER_TIMEOUT_MS = 12_000;
const PAGE_TIMEOUT_MS = 8_000;

function fail(error: string): ExtractResult {
  return { error };
}

function ok(media: ExtractedMedia): ExtractResult {
  if (!isAllowedMediaUrl(media.url)) {
    return fail('Extractor returned a host we will not proxy.');
  }
  return media;
}

async function fetchText(url: string, headers: Record<string, string>, timeout = PAGE_TIMEOUT_MS): Promise<string> {
  const response = await fetch(url, {
    headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/json;q=0.9,*/*;q=0.8', ...headers },
    signal: AbortSignal.timeout(timeout),
    redirect: 'follow',
  });
  if (!response.ok) return '';
  return response.text();
}

async function fetchJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json', ...(init.headers || {}) },
    signal: init.signal ?? AbortSignal.timeout(PAGE_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

function firstHttps(...candidates: Array<unknown>): string {
  for (const value of candidates) {
    if (typeof value !== 'string') continue;
    const trimmed = value.replace(/\\u0026/g, '&').replace(/\\\//g, '/').trim();
    if (/^https:\/\//i.test(trimmed)) return trimmed;
  }
  return '';
}

function metaContent(html: string, property: string): string {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const a = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'));
  if (a?.[1]) return a[1].replace(/&amp;/g, '&');
  const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i'));
  return b?.[1] ? b[1].replace(/&amp;/g, '&') : '';
}

function jsonStringField(source: string, key: string): string {
  const re = new RegExp(`"${key}"\\s*:\\s*"(https:[^"]+)"`, 'i');
  const match = source.match(re);
  return match ? match[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/') : '';
}

/* -------------------------------------------------------------------------- */
/* YouTube / YT Music                                                         */
/* -------------------------------------------------------------------------- */

interface InnertubeClient {
  clientName: 'ANDROID' | 'IOS';
  clientVersion: string;
  userAgent: string;
  clientId: string;
  extra?: Record<string, unknown>;
}

const INNERTUBE_CLIENTS: InnertubeClient[] = [
  {
    clientName: 'ANDROID',
    clientVersion: '19.44.38',
    userAgent: 'com.google.android.youtube/19.44.38 (Linux; U; Android 14) gzip',
    clientId: '3',
    extra: { androidSdkVersion: 30 },
  },
  {
    clientName: 'IOS',
    clientVersion: '19.45.4',
    userAgent: 'com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)',
    clientId: '5',
    extra: { deviceMake: 'Apple', deviceModel: 'iPhone16,2' },
  },
];

function collectPlayerFormats(data: Record<string, unknown>): PlayerFormat[] {
  const streaming = (data.streamingData || {}) as {
    formats?: PlayerFormat[];
    adaptiveFormats?: PlayerFormat[];
  };
  return [...(streaming.formats || []), ...(streaming.adaptiveFormats || [])];
}

async function innertubeFormats(videoId: string): Promise<PlayerFormat[]> {
  for (const client of INNERTUBE_CLIENTS) {
    try {
      const response = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': client.userAgent,
          'X-YouTube-Client-Name': client.clientId,
          'X-YouTube-Client-Version': client.clientVersion,
        },
        body: JSON.stringify({
          videoId,
          contentCheckOk: true,
          racyCheckOk: true,
          context: {
            client: {
              clientName: client.clientName,
              clientVersion: client.clientVersion,
              hl: 'en',
              gl: 'US',
              utcOffsetMinutes: 0,
              userAgent: client.userAgent,
              ...(client.extra || {}),
            },
          },
        }),
        signal: AbortSignal.timeout(PLAYER_TIMEOUT_MS),
      });
      if (!response.ok) continue;
      const data = (await response.json()) as Record<string, unknown>;
      const playability = (data.playabilityStatus || {}) as { status?: string };
      if (playability.status && playability.status !== 'OK') continue;
      const formats = collectPlayerFormats(data);
      if (formats.some(f => f.url)) return formats;
    } catch {
      // try the next client
    }
  }
  return [];
}

function fromInvidious(data: Record<string, unknown>): PlayerFormat[] {
  const out: PlayerFormat[] = [];
  const progressive = (data.formatStreams || []) as Array<Record<string, unknown>>;
  for (const item of progressive) {
    out.push({
      url: typeof item.url === 'string' ? item.url : undefined,
      mimeType: typeof item.type === 'string' ? item.type : 'video/mp4',
      qualityLabel: typeof item.qualityLabel === 'string' ? item.qualityLabel : undefined,
      audioQuality: 'AUDIO_QUALITY_MEDIUM',
      bitrate: typeof item.bitrate === 'number' ? item.bitrate : Number(item.bitrate) || 0,
      height: parseInt(String(item.resolution || item.qualityLabel || '0'), 10) || 0,
      itag: Number(item.itag) || 0,
    });
  }
  const adaptive = (data.adaptiveFormats || []) as Array<Record<string, unknown>>;
  for (const item of adaptive) {
    const type = typeof item.type === 'string' ? item.type : '';
    out.push({
      url: typeof item.url === 'string' ? item.url : undefined,
      mimeType: type,
      qualityLabel: typeof item.qualityLabel === 'string' ? item.qualityLabel : undefined,
      audioQuality: /audio\//i.test(type) ? 'AUDIO_QUALITY_MEDIUM' : undefined,
      bitrate: typeof item.bitrate === 'number' ? item.bitrate : Number(item.bitrate) || 0,
      height: parseInt(String(item.resolution || item.qualityLabel || '0'), 10) || 0,
      itag: Number(item.itag) || 0,
    });
  }
  return out;
}

async function invidiousFormats(videoId: string): Promise<PlayerFormat[]> {
  for (const base of INVIDIOUS_INSTANCES) {
    try {
      const response = await fetch(invidiousVideoUrl(base, videoId), {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; YTConvert/1.0)' },
        signal: AbortSignal.timeout(PLAYER_TIMEOUT_MS),
      });
      if (!response.ok) continue;
      const data = (await response.json()) as Record<string, unknown>;
      const formats = fromInvidious(data);
      if (formats.some(f => f.url)) return formats;
    } catch {
      // next instance
    }
  }
  return [];
}

async function extractYouTube(pageUrl: string, format: FormatKey): Promise<ExtractResult> {
  const id = extractYouTubeId(pageUrl);
  if (!id) return fail('Invalid YouTube URL');

  let formats = await innertubeFormats(id);
  if (!formats.length) formats = await invidiousFormats(id);
  if (!formats.length) {
    return fail('YouTube did not return a playable stream. Try a converter below.');
  }

  const kind = format === 'mp4' ? 'video' : 'audio';
  const picked = pickYouTubeFormat(formats, kind);
  if (!picked?.url) {
    return fail(
      kind === 'video'
        ? 'No progressive MP4 with audio is available for this video.'
        : 'No audio-only stream is available for this video.',
    );
  }

  const mimeType = picked.mimeType || (kind === 'video' ? 'video/mp4' : 'audio/mp4');
  return ok({
    url: picked.url,
    mimeType,
    extension: extensionForMime(mimeType, kind === 'video' ? 'mp4' : 'm4a'),
    qualityLabel: picked.qualityLabel,
  });
}

/* -------------------------------------------------------------------------- */
/* SoundCloud                                                                 */
/* -------------------------------------------------------------------------- */

let soundCloudClient: { id: string; at: number } | null = null;
const SC_CLIENT_TTL_MS = 60 * 60 * 1000;

async function soundCloudClientId(): Promise<string> {
  if (soundCloudClient && Date.now() - soundCloudClient.at < SC_CLIENT_TTL_MS) {
    return soundCloudClient.id;
  }
  const html = await fetchText('https://soundcloud.com/', {});
  const inline = html.match(/client_id["']?\s*[:=]\s*["']([A-Za-z0-9]{16,})["']/);
  if (inline?.[1]) {
    soundCloudClient = { id: inline[1], at: Date.now() };
    return inline[1];
  }
  const scripts = [...html.matchAll(/src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)].map(m => m[1]);
  for (const src of scripts.slice(-6).reverse()) {
    const js = await fetchText(src, {});
    const match = js.match(/client_id:"([A-Za-z0-9]{16,})"/) || js.match(/client_id=([A-Za-z0-9]{16,})/);
    if (match?.[1]) {
      soundCloudClient = { id: match[1], at: Date.now() };
      return match[1];
    }
  }
  return '';
}

async function extractSoundCloud(pageUrl: string, format: FormatKey): Promise<ExtractResult> {
  if (format === 'mp4') {
    return fail('SoundCloud has no video file. Choose audio, or use a converter below.');
  }
  const clientId = await soundCloudClientId();
  if (!clientId) return fail('Could not reach the SoundCloud API. Try a converter below.');

  const resolved = (await fetchJson(
    `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(pageUrl)}&client_id=${encodeURIComponent(clientId)}`,
  )) as Record<string, unknown> | null;
  if (!resolved) return fail('SoundCloud could not resolve this track.');

  const media = (resolved.media || {}) as { transcodings?: Array<Record<string, unknown>> };
  const transcodings = media.transcodings || [];
  const progressive = transcodings.find(t => {
    const fmt = (t.format || {}) as { protocol?: string };
    return fmt.protocol === 'progressive' && typeof t.url === 'string';
  });
  if (!progressive || typeof progressive.url !== 'string') {
    return fail('No progressive SoundCloud download is available for this track.');
  }

  const streamUrl = progressive.url.includes('client_id=')
    ? progressive.url
    : `${progressive.url}${progressive.url.includes('?') ? '&' : '?'}client_id=${encodeURIComponent(clientId)}`;
  const stream = (await fetchJson(streamUrl)) as { url?: string } | null;
  const file = firstHttps(stream?.url);
  if (!file) return fail('SoundCloud did not return a stream URL.');

  const mimeType = /opus|ogg/i.test(String(progressive.preset || '')) ? 'audio/ogg' : 'audio/mpeg';
  return ok({
    url: file,
    mimeType,
    extension: extensionForMime(mimeType, 'mp3'),
    note: 'SoundCloud progressive stream',
  });
}

/* -------------------------------------------------------------------------- */
/* TikTok                                                                     */
/* -------------------------------------------------------------------------- */

export function extractTikTokId(url: string): string | null {
  const match = url.match(/\/video\/(\d{5,})/i) || url.match(/[?&](?:item_id|id)=(\d{5,})/i);
  return match ? match[1] : null;
}

function tiktokFromObject(data: unknown): { url: string; watermarked: boolean } | null {
  if (!data) return null;
  const json = typeof data === 'string' ? data : typeof data === 'object' ? JSON.stringify(data) : '';
  if (!json) return null;
  const download = jsonStringField(json, 'downloadAddr') || jsonStringField(json, 'download_addr');
  const play = jsonStringField(json, 'playAddr') || jsonStringField(json, 'play_addr');
  const url = firstHttps(download, play);
  if (!url) return null;
  return { url, watermarked: !download && Boolean(play) };
}

async function extractTikTok(pageUrl: string, format: FormatKey): Promise<ExtractResult> {
  if (format === 'mp3') {
    return fail('TikTok has no separate audio file we can proxy. Download the video, or use a converter.');
  }
  const id = extractTikTokId(pageUrl);

  if (id) {
    const player = await fetchJson(`https://www.tiktok.com/player/api/v1/items?item_ids=${id}`);
    const fromPlayer = tiktokFromObject(player);
    if (fromPlayer) {
      return ok({
        url: fromPlayer.url,
        mimeType: 'video/mp4',
        extension: 'mp4',
        watermarked: fromPlayer.watermarked,
        note: fromPlayer.watermarked ? 'Official player URL (watermarked)' : 'Official player URL',
      });
    }

    const embed = await fetchText(`https://www.tiktok.com/embed/v2/${id}`, { Referer: 'https://www.tiktok.com/' });
    const fromEmbed = tiktokFromObject(embed);
    if (fromEmbed) {
      return ok({
        url: fromEmbed.url,
        mimeType: 'video/mp4',
        extension: 'mp4',
        watermarked: fromEmbed.watermarked,
        note: fromEmbed.watermarked ? 'Embed player URL (watermarked)' : 'Embed player URL',
      });
    }
  }

  const html = await fetchText(pageUrl, { Referer: 'https://www.tiktok.com/' });
  const universal = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  if (universal?.[1]) {
    try {
      const fromPage = tiktokFromObject(JSON.parse(universal[1]));
      if (fromPage) {
        return ok({
          url: fromPage.url,
          mimeType: 'video/mp4',
          extension: 'mp4',
          watermarked: fromPage.watermarked,
          note: fromPage.watermarked ? 'Page player URL (watermarked)' : 'Page player URL',
        });
      }
    } catch {
      // fall through
    }
  }

  return fail('TikTok did not expose a public video file. Try SSSTik or another converter.');
}

/* -------------------------------------------------------------------------- */
/* X / Twitter                                                                */
/* -------------------------------------------------------------------------- */

export function extractTweetId(url: string): string | null {
  const match = url.match(/status(?:es)?\/(\d{1,20})(?!\d)/i);
  return match ? match[1] : null;
}

/** Public syndication token used by Twitter's own embed widgets (not a session secret). */
export function twitterSyndicationToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
}

function bestMp4Variant(variants: unknown): string {
  if (!Array.isArray(variants)) return '';
  const mp4s = variants
    .map(v => v as { content_type?: string; contentType?: string; bitrate?: number; url?: string })
    .filter(v => /video\/mp4/i.test(v.content_type || v.contentType || '') && typeof v.url === 'string');
  mp4s.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
  return firstHttps(mp4s[0]?.url);
}

async function extractTwitter(pageUrl: string, format: FormatKey): Promise<ExtractResult> {
  if (format === 'mp3') {
    return fail('X/Twitter has no separate audio file we can proxy. Download the video, or use Twitsave.');
  }
  const id = extractTweetId(pageUrl);
  if (!id) return fail('Could not find a tweet id in that link.');

  const token = twitterSyndicationToken(id);
  const data = (await fetchJson(
    `https://cdn.syndication.twimg.com/tweet-result?id=${encodeURIComponent(id)}&lang=en&token=${encodeURIComponent(token)}`,
  )) as Record<string, unknown> | null;

  if (data) {
    const mediaDetails = (data.mediaDetails || data.media_details || []) as Array<Record<string, unknown>>;
    for (const media of mediaDetails) {
      const info = (media.video_info || media.videoInfo || {}) as { variants?: unknown };
      const url = bestMp4Variant(info.variants);
      if (url) {
        return ok({ url, mimeType: 'video/mp4', extension: 'mp4', note: 'Twitter syndication embed' });
      }
    }
      const video = (data.video || {}) as { variants?: unknown };
    const fromVideo = bestMp4Variant(video.variants);
    if (fromVideo) {
      return ok({ url: fromVideo, mimeType: 'video/mp4', extension: 'mp4', note: 'Twitter syndication embed' });
    }
  }

  return fail('X/Twitter did not expose a public video (guest embed failed). Try Twitsave.');
}

/* -------------------------------------------------------------------------- */
/* Instagram                                                                  */
/* -------------------------------------------------------------------------- */

export function extractInstagramShortcode(url: string): string | null {
  const match = url.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  return match ? match[1] : null;
}

async function extractInstagram(pageUrl: string, format: FormatKey): Promise<ExtractResult> {
  if (format === 'mp3') {
    return fail('Instagram has no separate audio file we can proxy. Download the video, or use FastDL.');
  }
  const shortcode = extractInstagramShortcode(pageUrl);
  const candidates = [
    pageUrl,
    shortcode ? `https://www.instagram.com/p/${shortcode}/embed/captioned/` : '',
    shortcode ? `https://www.instagram.com/reel/${shortcode}/embed/` : '',
  ].filter(Boolean);

  for (const target of candidates) {
    const html = await fetchText(target, { Referer: 'https://www.instagram.com/' });
    if (!html) continue;
    const og = firstHttps(metaContent(html, 'og:video'), metaContent(html, 'og:video:secure_url'));
    const jsonUrl = firstHttps(
      jsonStringField(html, 'video_url'),
      jsonStringField(html, 'videoUrl'),
      jsonStringField(html, 'contentUrl'),
    );
    const url = firstHttps(og, jsonUrl);
    if (url) {
      return ok({ url, mimeType: 'video/mp4', extension: 'mp4', note: 'Public Instagram embed / oEmbed video' });
    }
  }

  return fail('Instagram did not expose a public video URL (login wall). Try FastDL or copy the link.');
}

/* -------------------------------------------------------------------------- */
/* Facebook                                                                   */
/* -------------------------------------------------------------------------- */

async function extractFacebook(pageUrl: string, format: FormatKey): Promise<ExtractResult> {
  if (format === 'mp3') {
    return fail('Facebook has no separate audio file we can proxy. Download the video, or use FBDown.');
  }
  const html = await fetchText(pageUrl, { Referer: 'https://www.facebook.com/' });
  if (!html) return fail('Could not load this Facebook page. Only public video / share URLs work.');

  const og = firstHttps(metaContent(html, 'og:video'), metaContent(html, 'og:video:url'), metaContent(html, 'og:video:secure_url'));
  const hd = firstHttps(jsonStringField(html, 'hd_src'), jsonStringField(html, 'hd_src_no_ratelimit'));
  const sd = firstHttps(jsonStringField(html, 'sd_src'), jsonStringField(html, 'sd_src_no_ratelimit'));
  const playable = firstHttps(jsonStringField(html, 'playable_url_quality_hd'), jsonStringField(html, 'playable_url'));
  const url = firstHttps(hd, playable, og, sd);
  if (url) {
    return ok({ url, mimeType: 'video/mp4', extension: 'mp4', note: 'Public Facebook video page' });
  }
  return fail('This Facebook video is not publicly streamable. Try FBDown.');
}

/* -------------------------------------------------------------------------- */
/* DRM / no public file                                                       */
/* -------------------------------------------------------------------------- */

function drmFail(platform: string): ExtractResult {
  return fail(
    `${platform} catalog tracks are DRM-protected (preview only / use a licensed downloader). We do not strip Widevine or FairPlay.`,
  );
}

/* -------------------------------------------------------------------------- */

export async function extractMedia(platform: PlatformKey, pageUrl: string, format: FormatKey): Promise<ExtractResult> {
  switch (platform) {
    case 'youtube':
    case 'youtubemusic':
      return extractYouTube(pageUrl, format);
    case 'soundcloud':
      return extractSoundCloud(pageUrl, format);
    case 'tiktok':
      return extractTikTok(pageUrl, format);
    case 'twitter':
      return extractTwitter(pageUrl, format);
    case 'instagram':
      return extractInstagram(pageUrl, format);
    case 'facebook':
      return extractFacebook(pageUrl, format);
    case 'spotify':
      return drmFail('Spotify');
    case 'deezer':
      return drmFail('Deezer');
    case 'applemusic':
      return drmFail('Apple Music');
    case 'amazonmusic':
      return drmFail('Amazon Music');
    case 'snapchat':
      return fail('Snapchat does not expose a public media file we can proxy.');
    case 'br':
      return fail('BeReal posts are not available as public downloadable files.');
  }
}

export function isExtractError(result: ExtractResult): result is { error: string } {
  return 'error' in result;
}
