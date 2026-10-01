/**
 * Server-only media fetch with SSRF validation, redirect re-validation and
 * bounded transient retries.
 */

import { isAllowedMediaUrl } from './media-hosts';
import { youtubeAwareFetch } from './youtube-egress';

const MAX_REDIRECTS = 4;
const MAX_RETRIES = 2;
const CONNECT_TIMEOUT_MS = 20_000;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export class MediaHostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaHostError';
  }
}

export function refererForMediaUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === 'dlsrv.online' || host.endsWith('.dlsrv.online')) return 'https://embed.dlsrv.online/';
    if (host === '9convert.org' || host.endsWith('.9convert.org')) return 'https://9convert.org/';
    if (host === '9convert.com' || host.endsWith('.9convert.com')) return 'https://9convert.com/';
    if (host === 'ymcdn.org' || host.endsWith('.ymcdn.org')) return 'https://ahm7xmakki.com/';
  } catch {
    return null;
  }
  return null;
}

function applyFarmHeaders(url: string, headers: Headers): void {
  const override = refererForMediaUrl(url);
  if (override) headers.set('Referer', override);
  if (!headers.has('User-Agent')) headers.set('User-Agent', 'Mozilla/5.0 (compatible; YTConvert/1.0)');
}

function retryDelayMs(attempt: number, response?: Response): number {
  const retryAfter = response?.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(5000, Math.max(100, seconds * 1000));
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.min(5000, Math.max(100, date - Date.now()));
  }
  return Math.min(4000, 250 * 2 ** attempt + Math.floor(Math.random() * 150));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchOnce(url: string, init: RequestInit): Promise<Response> {
  if (init.signal) {
    return youtubeAwareFetch(url, { ...init, redirect: 'manual' });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);
  try {
    return await youtubeAwareFetch(url, { ...init, redirect: 'manual', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch a media URL, following redirects only onto allowlisted hosts. */
export async function fetchAllowedMedia(url: string, init: RequestInit = {}, hop = 0): Promise<Response> {
  if (hop > MAX_REDIRECTS) throw new MediaHostError('Too many redirects');
  if (!isAllowedMediaUrl(url)) throw new MediaHostError('Refusing to fetch a non-allowlisted host');

  const headers = new Headers(init.headers);
  applyFarmHeaders(url, headers);

  let response: Response | null = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      response = await fetchOnce(url, { ...init, headers });
      if (!RETRYABLE_STATUS.has(response.status) || attempt === MAX_RETRIES) break;

      // Retry only transient responses. Drain small/error bodies before the
      // next attempt so pooled connections remain reusable.
      try { await response.body?.cancel(); } catch { /* ignore */ }
      await sleep(retryDelayMs(attempt, response));
    } catch (error) {
      lastError = error;
      if (attempt === MAX_RETRIES) break;
      await sleep(retryDelayMs(attempt));
    }
  }

  if (!response) {
    throw new MediaHostError(lastError instanceof Error && lastError.name === 'AbortError'
      ? 'Media host connection timed out'
      : 'Media host connection failed');
  }

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    if (!location) throw new MediaHostError('Redirect without Location');
    try { await response.body?.cancel(); } catch { /* ignore */ }
    const next = new URL(location, url).toString();
    return fetchAllowedMedia(next, init, hop + 1);
  }

  return response;
}
