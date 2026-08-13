/**
 * Public 9Convert/dlsrv farm fallback.
 *
 * The legacy farm speaks the y2mate-style two-step protocol used by
 * 9convert.com: POST ajaxSearch/index with `query` + `vt`, choose a returned
 * key, then POST ajaxConvert/convert with `vid` + `k`. 9convert.com itself is
 * gone, but the protocol has appeared on 9convert.org and
 * embed.dlsrv.online. Empty/404 hops are deliberately ignored.
 *
 * In August 2026 embed.dlsrv.online moved its live UI to JSON endpoints
 * (`/api/info` and `/api/download/{mp3|mp4}`). We try that current contract
 * first and retain the old ajax contract as a non-fatal compatibility path.
 * Every returned media URL is checked by the same narrow allowlist used by
 * /api/convert; arbitrary farm redirects never become an SSRF primitive.
 */

import { isAllowedMediaUrl } from './media-hosts';
import type { PlayerFormat } from './youtube-formats';

export type NineConvertKind = 'mp3' | 'mp4';

export const NINECONVERT_BASES = [
  'https://9convert.org',
  'https://embed.dlsrv.online',
] as const;

export const DLSRV_CURRENT_BASE = 'https://embed.dlsrv.online/api';

const FARM_TIMEOUT_MS = 7_000;
const FARM_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';

interface FarmChoice {
  key: string;
  quality: string;
  format: string;
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numericQuality(value: string): number {
  const match = value.match(/\d{2,4}/);
  return match ? Number(match[0]) : 0;
}

/** Select exact quality, otherwise nearest at-or-below, otherwise best. */
function chooseByQuality<T>(items: T[], quality: string | undefined, label: (item: T) => string): T | undefined {
  if (!items.length) return undefined;
  const scored = items
    .map(item => ({ item, score: numericQuality(label(item)) }))
    .sort((a, b) => b.score - a.score);
  if (!quality || quality === 'best' || !/^\d+$/.test(quality)) return scored[0]?.item;
  const target = Number(quality);
  return (scored.find(candidate => candidate.score === target)
    || scored.find(candidate => candidate.score > 0 && candidate.score <= target)
    || scored[scored.length - 1])?.item;
}

/** Pull format-key records from the few response shapes used by the farm. */
function farmChoices(payload: JsonRecord, kind: NineConvertKind): FarmChoice[] {
  const links = record(payload.links) || record(record(payload.data)?.links);
  if (!links) return [];
  const group = record(links[kind]) || links;
  const choices: FarmChoice[] = [];
  for (const [slot, raw] of Object.entries(group)) {
    const item = record(raw);
    if (!item) continue;
    const key = text(item.k) || text(item.key);
    if (!key) continue;
    const format = (text(item.f) || text(item.format) || kind).toLowerCase();
    if (format !== kind) continue;
    choices.push({
      key,
      quality: text(item.q) || text(item.quality) || slot,
      format,
    });
  }
  return choices;
}

const NINECONVERT_MEDIA_SUFFIXES = [
  'dlsrv.online',
  '9convert.org',
  '9convert.com',
  'googlevideo.com',
] as const;

/** Farm responses may only point at the farm itself or googlevideo. */
export function isAllowedNineConvertUrl(raw: string): boolean {
  if (!isAllowedMediaUrl(raw)) return false;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return NINECONVERT_MEDIA_SUFFIXES.some(suffix => host === suffix || host.endsWith(`.${suffix}`));
  } catch {
    return false;
  }
}

function mediaUrl(payload: unknown): string {
  const body = record(payload);
  if (!body) return '';
  const data = record(body.data);
  const result = record(body.result);
  const candidates = [
    body.dlink,
    body.url,
    body.downloadUrl,
    data?.dlink,
    data?.url,
    data?.downloadUrl,
    result?.dlink,
    result?.url,
    result?.downloadUrl,
  ];
  for (const candidate of candidates) {
    const url = text(candidate)
      .replace(/&amp;/g, '&')
      .replace(/\\u0026/g, '&')
      .replace(/\\\//g, '/');
    if (/^https:\/\//i.test(url) && isAllowedNineConvertUrl(url)) return url;
  }
  return '';
}

function toPlayerFormat(url: string, kind: NineConvertKind, quality: string): PlayerFormat {
  const score = numericQuality(quality);
  if (kind === 'mp3') {
    return {
      url,
      mimeType: 'audio/mpeg',
      audioQuality: 'AUDIO_QUALITY_MEDIUM',
      bitrate: score ? score * 1_000 : undefined,
      itag: 920_000 + score,
    };
  }
  return {
    url,
    mimeType: 'video/mp4; codecs="avc1, mp4a.40.2"',
    qualityLabel: score ? `${score}p` : quality || undefined,
    height: score || undefined,
    // dlsrv returns a finished file, not a video-only adaptive track.
    audioQuality: 'AUDIO_QUALITY_MEDIUM',
    itag: 910_000 + score,
  };
}

function farmHeaders(base: string, videoId: string, json = false): Record<string, string> {
  return {
    Accept: 'application/json, text/plain, */*',
    'Content-Type': json ? 'application/json' : 'application/x-www-form-urlencoded; charset=UTF-8',
    Origin: base,
    Referer: `${base}/v2/full?videoId=${encodeURIComponent(videoId)}`,
    'User-Agent': FARM_UA,
  };
}

async function postJson(url: string, body: string, headers: Record<string, string>): Promise<JsonRecord | null> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(FARM_TIMEOUT_MS),
    });
    // A dead endpoint, Cloudflare page, or empty body is just one failed hop.
    if (!response.ok) return null;
    return record(await response.json().catch(() => null));
  } catch {
    return null;
  }
}

function defaultDlsrvQuality(kind: NineConvertKind, quality?: string): string {
  if (quality && /^\d+$/.test(quality)) return quality;
  return kind === 'mp3' ? '320' : '720';
}

function currentDlsrvQualities(payload: JsonRecord | null, kind: NineConvertKind): string[] {
  const info = record(payload?.info);
  const formats = Array.isArray(info?.formats) ? info.formats : [];
  const values: string[] = [];
  for (const raw of formats) {
    const item = record(raw);
    if (!item || text(item.type).toLowerCase() !== (kind === 'mp3' ? 'audio' : 'video')) continue;
    const format = text(item.format).toLowerCase();
    if (kind === 'mp4' && format && format !== 'mp4') continue;
    const value = text(item.quality) || format;
    if (numericQuality(value)) values.push(value);
  }
  // MP3 bitrates are generated by the service and are not always repeated in
  // /api/info (the UI offers this fixed set).
  if (kind === 'mp3') values.push('320', '256', '128', '96', '64');
  return [...new Set(values)];
}

/** Current embed.dlsrv.online JSON contract (the old ajax routes now 404). */
async function currentDlsrvFormats(
  videoId: string,
  kind: NineConvertKind,
  quality?: string,
): Promise<PlayerFormat[]> {
  const origin = 'https://embed.dlsrv.online';
  const headers = farmHeaders(origin, videoId, true);
  const info = await postJson(
    `${DLSRV_CURRENT_BASE}/info`,
    JSON.stringify({ videoId }),
    headers,
  );
  const available = currentDlsrvQualities(info, kind);
  const selected = chooseByQuality(available, quality, value => value)
    || defaultDlsrvQuality(kind, quality);
  const payload = await postJson(
    `${DLSRV_CURRENT_BASE}/download/${kind}`,
    JSON.stringify({ videoId, format: kind, quality: String(numericQuality(selected) || selected) }),
    headers,
  );
  const url = mediaUrl(payload);
  return url ? [toPlayerFormat(url, kind, selected)] : [];
}

async function legacyAjaxFormats(
  base: string,
  apiPrefix: '' | '/api',
  videoId: string,
  kind: NineConvertKind,
  quality?: string,
): Promise<PlayerFormat[]> {
  const root = base.replace(/\/$/, '');
  const headers = farmHeaders(root, videoId);
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const search = await postJson(
    `${root}${apiPrefix}/ajaxSearch/index`,
    new URLSearchParams({ query: watchUrl, vt: kind }).toString(),
    headers,
  );
  if (!search) return [];
  const selected = chooseByQuality(farmChoices(search, kind), quality, item => item.quality);
  if (!selected) return [];
  const vid = text(search.vid) || text(record(search.data)?.vid) || videoId;
  const converted = await postJson(
    `${root}${apiPrefix}/ajaxConvert/convert`,
    new URLSearchParams({ vid, k: selected.key }).toString(),
    headers,
  );
  const url = mediaUrl(converted);
  return url ? [toPlayerFormat(url, kind, selected.quality)] : [];
}

async function firstNonEmpty(attempts: Array<Promise<PlayerFormat[]>>): Promise<PlayerFormat[]> {
  if (!attempts.length) return [];
  try {
    return await Promise.any(
      attempts.map(attempt => attempt.then(formats => {
        if (!formats.length) throw new Error('empty farm hop');
        return formats;
      })),
    );
  } catch {
    return [];
  }
}

/**
 * Ask the public 9Convert family for a completed media URL.
 *
 * This is intentionally best-effort: 404, empty JSON, schema drift, timeout,
 * and an unapproved dlink all return `[]`, allowing cobalt/the final honest
 * error to run instead of turning one dead farm host into a hard failure.
 */
export async function nineConvertFormats(
  videoId: string,
  kind: NineConvertKind,
  quality?: string,
): Promise<PlayerFormat[]> {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return [];

  const current = await currentDlsrvFormats(videoId, kind, quality);
  if (current.length) return current;

  // Try both route layouts concurrently. Historical 9convert used /api;
  // clones have also mounted the same controllers at the domain root.
  return firstNonEmpty(
    NINECONVERT_BASES.flatMap(base => [
      legacyAjaxFormats(base, '/api', videoId, kind, quality),
      legacyAjaxFormats(base, '', videoId, kind, quality),
    ]),
  );
}
