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
 *
 * Cookies: per-request in-memory jar, scoped to the requesting host, never
 * forwarded cross-host, never returned to the browser. When the API sets a
 * Set-Cookie (often Cloudflare/anti-bot short-lived cookies), the matching
 * Cookie header is propagated to the follow-up dlink request only.
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

/* --------------------------- Per-request cookie jar ---------------------- */

interface CookieJar {
  /** host (lowercase) -> "name=value; name2=value2" */
  byHost: Map<string, string>;
}

function newJar(): CookieJar {
  return { byHost: new Map() };
}

function hostOf(raw: string): string {
  try { return new URL(raw).hostname.toLowerCase(); } catch { return ''; }
}

function rememberSetCookie(jar: CookieJar, url: string, headers: Headers): void {
  const host = hostOf(url);
  if (!host) return;
  const setCookies: string[] = [];
  headers.forEach((v, k) => {
    if (k.toLowerCase() === 'set-cookie') setCookies.push(v);
  });
  if (!setCookies.length) return;
  const existing = jar.byHost.get(host) || '';
  const existingMap = new Map<string, string>();
  for (const part of existing.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    existingMap.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }
  for (const sc of setCookies) {
    const first = sc.split(';')[0] || '';
    const eq = first.indexOf('=');
    if (eq <= 0) continue;
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    if (!name) continue;
    existingMap.set(name, value);
  }
  const cookieHeader = [...existingMap.entries()].map(([n, v]) => `${n}=${v}`).join('; ');
  jar.byHost.set(host, cookieHeader);
}

function farmHeaders(base: string, jar: CookieJar, videoId: string, json = false): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
    'Content-Type': json ? 'application/json' : 'application/x-www-form-urlencoded; charset=UTF-8',
    Origin: base,
    // Use the /v2/full?videoId= Referer that the live embed UI carries. This
    // is the exact same-site Referer fetchAllowedMedia will re-apply when
    // the returned dlink is fetched later.
    Referer: `${base}/v2/full?videoId=${encodeURIComponent(videoId)}`,
    'User-Agent': FARM_UA,
  };
  const cookie = jar.byHost.get(hostOf(base));
  if (cookie) headers.Cookie = cookie;
  return headers;
}

/* ---------------------------- Fetch helpers ----------------------------- */

async function farmFetch(
  jar: CookieJar,
  url: string,
  init: RequestInit,
): Promise<Response | null> {
  try {
    const response = await fetch(url, {
      ...init,
      redirect: 'manual',
      signal: init.signal ?? AbortSignal.timeout(FARM_TIMEOUT_MS),
    });
    rememberSetCookie(jar, url, response.headers);
    // Follow one allowlisted redirect hop (with cookies) if the farm issues
    // a 302 to its own CDN.
    if (response.status >= 300 && response.status < 400) {
      const loc = response.headers.get('location');
      if (!loc) return null;
      const next = new URL(loc, url).toString();
      if (!isAllowedNineConvertUrl(next)) return null;
      const hdrs = new Headers(init.headers as HeadersInit);
      const cookie = jar.byHost.get(hostOf(next));
      if (cookie) hdrs.set('cookie', cookie);
      try { await response.arrayBuffer(); } catch { /* drain */ }
      const redir = await fetch(next, {
        method: 'GET',
        headers: hdrs,
        redirect: 'manual',
        signal: init.signal ?? AbortSignal.timeout(FARM_TIMEOUT_MS),
      });
      rememberSetCookie(jar, next, redir.headers);
      return redir;
    }
    return response;
  } catch {
    return null;
  }
}

async function postJson(
  jar: CookieJar,
  url: string,
  body: string,
  headers: Record<string, string>,
): Promise<JsonRecord | null> {
  const response = await farmFetch(jar, url, {
    method: 'POST',
    headers,
    body,
  });
  if (!response || !response.ok) return null;
  // Challenge pages often return text/html. Reject anything that isn't JSON.
  const ct = (response.headers.get('content-type') || '').toLowerCase();
  if (!/json/i.test(ct) && !/text\/plain/i.test(ct)) {
    try { await response.arrayBuffer(); } catch { /* drain */ }
    return null;
  }
  let parsed: unknown = null;
  try {
    // Read text so the body is fully consumed — response.json() can leave a
    // locked stream in some environments.
    const text = await response.text();
    parsed = text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
  return record(parsed);
}

/* ----------------------- dlink probing / validation --------------------- */

const FARM_PROBE_BYTES = 2048;

// Minimal HTML / MP3 / MP4 byte checks mirrored from media-content.ts so we
// don't have to import the route-time validation here. We only need enough
// to reject obvious CAPTCHA/HTML pages and WebM-as-MP4 before accepting a
// candidate dlink.
function looksLikeHtml(bytes: Uint8Array): boolean {
  if (!bytes.length) return false;
  const ascii = bytes.slice();
  for (let i = 0; i < ascii.length; i += 1) {
    const b = ascii[i];
    if (b >= 0x61 && b <= 0x7a) ascii[i] = b - 0x20;
  }
  const enc = new TextDecoder('ascii', { fatal: false });
  const head = enc.decode(ascii);
  return (
    /<!DOCTYPE HTML|<HTML|<HEAD|<BODY|<SCRIPT|<!--/i.test(head)
  );
}

function startsWithBytes(haystack: Uint8Array, needle: Uint8Array, offset = 0): boolean {
  if (haystack.length - offset < needle.length) return false;
  for (let i = 0; i < needle.length; i += 1) {
    if (haystack[offset + i] !== needle[i]) return false;
  }
  return true;
}

function hasMpegSync(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length - 1, 1024);
  for (let i = 0; i < limit; i += 1) {
    if (bytes[i] !== 0xff) continue;
    const second = bytes[i + 1];
    if ((second & 0xe0) !== 0xe0) continue;
    const version = (second >> 3) & 0x03;
    const layer = (second >> 1) & 0x03;
    if (version === 0x01 || layer === 0x00) continue;
    return true;
  }
  return false;
}

function hasFtyp(bytes: Uint8Array, brands: string[]): boolean {
  if (bytes.length < 12) return false;
  const ftyp = new TextEncoder().encode('ftyp');
  if (!startsWithBytes(bytes, ftyp, 4)) return false;
  let brand = '';
  try {
    brand = new TextDecoder('ascii', { fatal: false }).decode(bytes.subarray(8, 12));
  } catch {
    return false;
  }
  return brands.includes(brand);
}

const MP4_BRANDS = ['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'qt  ', 'dash', 'M4A ', 'M4V '];
const ID3 = new TextEncoder().encode('ID3');
const EBML = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);
const OGGS = new TextEncoder().encode('OggS');

function sniffProbe(kind: NineConvertKind, bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  if (looksLikeHtml(bytes)) return false;
  if (kind === 'mp3') {
    if (startsWithBytes(bytes, ID3)) return true;
    if (hasMpegSync(bytes)) return true;
    return false;
  }
  // mp4
  if (startsWithBytes(bytes, EBML) || startsWithBytes(bytes, OGGS)) return false; // webm/ogg
  if (hasFtyp(bytes, MP4_BRANDS)) return true;
  return false;
}

/**
 * Small Range=0- probe against the candidate dlink, using the same per-host
 * cookies + farm Referer. If the response isn't a real MP3/MP4 (or is HTML),
 * the candidate is discarded and the next farm route is tried.
 */
async function probeCandidateDlink(jar: CookieJar, url: string, kind: NineConvertKind, videoId: string = ''): Promise<boolean> {
  if (!isAllowedNineConvertUrl(url)) return false;
  const host = hostOf(url);
  if (!host) return false;
  const refererBase = host === 'embed.dlsrv.online' || host.endsWith('.dlsrv.online')
    ? 'https://embed.dlsrv.online'
    : host.endsWith('.9convert.org') || host === '9convert.org'
      ? 'https://9convert.org'
      : host.endsWith('.9convert.com') || host === '9convert.com'
        ? 'https://9convert.com'
        : `https://${host}`;
  const headers: Record<string, string> = {
    Accept: '*/*',
    // Do not send a hard Range: some test/undici combinations throw
    // "offset is out of bounds" when the upstream body is shorter than the
    // requested window. We only read the first ~2KB from the body in userland
    // and cancel, which is equivalent for detection purposes.
    Referer: `${refererBase}/v2/full?videoId=${encodeURIComponent(videoId)}`,
    'User-Agent': FARM_UA,
  };
  // For googlevideo dlinks minted by the farm we do not attach farm cookies
  // (they wouldn't apply and would leak cross-host).
  const cookie = jar.byHost.get(host);
  if (cookie) headers.Cookie = cookie;
  let response: Response | null = null;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(FARM_TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400) {
      const loc = response.headers.get('location');
      try { await response.arrayBuffer(); } catch { /* drain */ }
      if (!loc) return false;
      const next = new URL(loc, url).toString();
      if (!isAllowedNineConvertUrl(next)) return false;
      response = await fetch(next, {
        method: 'GET',
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(FARM_TIMEOUT_MS),
      });
    }
  } catch {
    return false;
  }
  if (!response || (!response.ok && response.status !== 206)) {
    try { if (response) await response.arrayBuffer(); } catch { /* drain */ }
    return false;
  }
  const ct = (response.headers.get('content-type') || '').toLowerCase();
  if (/text\/html|application\/xhtml|application\/xml|text\/xml/i.test(ct)) {
    try { await response.arrayBuffer(); } catch { /* drain */ }
    return false;
  }
  // For MP3 requests, reject obviously wrong containers even if the mime lied.
  if (kind === 'mp3' && /audio\/mp4|audio\/aac|video\//i.test(ct)) {
    try { await response.arrayBuffer(); } catch { /* drain */ }
    return false;
  }
  if (kind === 'mp4' && /video\/webm|audio\//i.test(ct)) {
    try { await response.arrayBuffer(); } catch { /* drain */ }
    return false;
  }
  // Read only the first ~2KB via arrayBuffer + slice. undici's ReadableStream
  // reader can throw "offset is out of bounds" on short bodies in some test
  // environments; reading a bounded buffer and slicing is equivalent for
  // sniffing purposes. We cancel any remainder by not continuing to read.
  let buf: Uint8Array;
  try {
    const full = await response.arrayBuffer();
    const len = Math.min(full.byteLength, FARM_PROBE_BYTES);
    buf = new Uint8Array(full, 0, len);
  } catch {
    return false;
  }
  const ok = sniffProbe(kind, buf);
  return ok;
}

/* ----------------------- Conversion-pending polling ---------------------- */

const FARM_POLL_TOTAL_MS = 55_000; // stay within the route's 60s limit
const FARM_POLL_INTERVAL_MS = 1_200;

function isPending(payload: JsonRecord | null): { pending: boolean; sleep?: number; dlink?: string } {
  if (!payload) return { pending: false };
  const status = text(payload.status)
    || text(payload.message)
    || text((record(payload.data) || {})?.status as string);
  const dlink = mediaUrl(payload);
  if (dlink) return { pending: false, dlink };
  const isProc = /processing|pending|converting|in.?progress|wait/i.test(status || text(payload.text));
  // Some responses use `success: false` with c_status: processing / e_status.
  const any = JSON.stringify(payload).toLowerCase();
  if (!isProc && !/processing|pending|converting|wait/.test(any)) return { pending: false };
  // Explicit sleep/eta field if present (seconds or ms).
  let sleepMs = FARM_POLL_INTERVAL_MS;
  const sleepSec = Number((payload as unknown as Record<string, unknown>).sleep)
    || Number((record(payload.data) || {})?.sleep);
  if (sleepSec > 0) sleepMs = Math.min(Math.max(sleepSec * (sleepSec < 60 ? 1000 : 1), 500), 4000);
  return { pending: true, sleep: sleepMs };
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
  if (kind === 'mp3') values.push('320', '256', '128', '96', '64');
  return [...new Set(values)];
}

/** Current embed.dlsrv.online JSON contract with bounded polling. */
async function currentDlsrvFormats(
  videoId: string,
  kind: NineConvertKind,
  quality?: string,
): Promise<PlayerFormat[]> {
  const origin = 'https://embed.dlsrv.online';
  const jar = newJar();
  const infoHeaders = farmHeaders(origin, jar, videoId, true);
  const info = await postJson(
    jar,
    `${DLSRV_CURRENT_BASE}/info`,
    JSON.stringify({ videoId }),
    infoHeaders,
  );
  const available = currentDlsrvQualities(info, kind);
  const selected = chooseByQuality(available, quality, value => value)
    || defaultDlsrvQuality(kind, quality);

  const dlHeaders = farmHeaders(origin, jar, videoId, true);
  const deadline = Date.now() + FARM_POLL_TOTAL_MS;
  let lastUrl = '';
  let lastPayload: JsonRecord | null = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const payload = await postJson(
      jar,
      `${DLSRV_CURRENT_BASE}/download/${kind}`,
      JSON.stringify({ videoId, format: kind, quality: String(numericQuality(selected) || selected) }),
      dlHeaders,
    );
    lastPayload = payload;
    const decision = isPending(payload);
    if (decision.dlink) { lastUrl = decision.dlink; break; }
    if (!decision.pending) { lastUrl = mediaUrl(payload); break; }
    if (Date.now() >= deadline) break;
    await new Promise(r => setTimeout(r, decision.sleep || FARM_POLL_INTERVAL_MS));
  }
  if (!lastUrl) {
    return [];
  }
  let probeOk = false;
  try {
    probeOk = await probeCandidateDlink(jar, lastUrl, kind, videoId);
  } catch {
    probeOk = false;
  }
  if (!probeOk) {
    return [];
  }
  return [toPlayerFormat(lastUrl, kind, selected)];
}

async function legacyAjaxFormats(
  base: string,
  apiPrefix: '' | '/api',
  videoId: string,
  kind: NineConvertKind,
  quality?: string,
): Promise<PlayerFormat[]> {
  const root = base.replace(/\/$/, '');
  const jar = newJar();
  const headers = farmHeaders(root, jar, videoId);
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const search = await postJson(
    jar,
    `${root}${apiPrefix}/ajaxSearch/index`,
    new URLSearchParams({ query: watchUrl, vt: kind }).toString(),
    headers,
  );
  if (!search) return [];
  const selected = chooseByQuality(farmChoices(search, kind), quality, item => item.quality);
  if (!selected) return [];
  const vid = text(search.vid) || text(record(search.data)?.vid) || videoId;

  const deadline = Date.now() + FARM_POLL_TOTAL_MS;
  let lastUrl = '';
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const converted = await postJson(
      jar,
      `${root}${apiPrefix}/ajaxConvert/convert`,
      new URLSearchParams({ vid, k: selected.key }).toString(),
      headers,
    );
    const decision = isPending(converted);
    if (decision.dlink) { lastUrl = decision.dlink; break; }
    if (!decision.pending) { lastUrl = mediaUrl(converted); break; }
    if (Date.now() >= deadline) break;
    await new Promise(r => setTimeout(r, decision.sleep || FARM_POLL_INTERVAL_MS));
  }
  if (!lastUrl) return [];
  let probeOk = false;
  try { probeOk = await probeCandidateDlink(jar, lastUrl, kind, videoId); } catch { probeOk = false; }
  if (!probeOk) return [];
  return [toPlayerFormat(lastUrl, kind, selected.quality)];
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
 * CAPTCHA/HTML responses, WebM-as-MP4, and unapproved dlinks all return `[]`,
 * allowing cobalt/the final honest error to run instead of turning one dead
 * farm host into a hard failure.
 */
export async function nineConvertFormats(
  videoId: string,
  kind: NineConvertKind,
  quality?: string,
): Promise<PlayerFormat[]> {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return [];

  const current = await currentDlsrvFormats(videoId, kind, quality);
  if (current.length) return current;

  // Bad current dlsrv candidate falls through to the legacy farm attempt.
  return firstNonEmpty(
    NINECONVERT_BASES.flatMap(base => [
      legacyAjaxFormats(base, '/api', videoId, kind, quality),
      legacyAjaxFormats(base, '', videoId, kind, quality),
    ]),
  );
}
