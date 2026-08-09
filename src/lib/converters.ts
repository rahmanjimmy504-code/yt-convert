/**
 * Shared converter catalog and availability checking.
 *
 * The catalog lives here (not in the page component) so the client UI, the
 * health-check API, the report API, and the admin dashboard all read the same
 * list and can never drift apart.
 *
 * Availability checks are deliberately conservative: a converter is
 * "working" only when an actual HTTP probe succeeds. Probes are cached for
 * STATUS_CACHE_TTL_MS so page views don't hammer third-party sites.
 */

import type { FormatKey, PlatformKey } from './platforms';

export interface Converter {
  name: string;
  url: string;
  desc: string;
  color: string;
  platforms: PlatformKey[];
  formats: FormatKey[];
  recommended?: boolean;
}

export type ConverterStatus = 'working' | 'unavailable' | 'unknown';

export interface ConverterCheckResult {
  name: string;
  url: string;
  status: ConverterStatus;
  /** Epoch ms of the probe. */
  checkedAt: number;
  /** Final HTTP status of the probe, when one was received. */
  statusCode?: number;
  /** Round-trip time of the probe, when one completed. */
  latencyMs?: number;
  /** Short human-readable failure reason (unavailable only). */
  error?: string;
  /** Number of user reports currently on file (dead/unsafe/...). */
  reports: number;
}

// Converter catalog lives at module scope: it never changes at runtime, so
// there is no reason to rebuild the array on every render.
export const ALL_CONVERTERS: Converter[] = [
  { name: '9Convert', url: 'https://9convert.org/', desc: 'YouTube to MP3 and MP4. Fast and reliable.', color: 'from-rose-500 to-rose-600', platforms: ['youtube', 'youtubemusic'], formats: ['mp3', 'mp4'], recommended: true },
  { name: 'Y2Mate', url: 'https://v30.www-y2mate.com/', desc: 'MP4 (144p-1080p) and MP3 (128-320kbps).', color: 'from-orange-500 to-orange-600', platforms: ['youtube', 'youtubemusic'], formats: ['mp3', 'mp4'] },
  { name: 'AudioConverter', url: 'https://audioconverter.ai/youtube-to-mp4-converter', desc: 'YouTube to MP4. HD and 4K.', color: 'from-sky-500 to-sky-600', platforms: ['youtube', 'youtubemusic'], formats: ['mp4'] },
  { name: 'Hicoo', url: 'https://hicoo.ai/mp4-converter/youtube-to-mp4', desc: 'YouTube to MP4. 360p to 4K.', color: 'from-emerald-500 to-emerald-600', platforms: ['youtube', 'youtubemusic'], formats: ['mp4'] },
  { name: 'KlickAud', url: 'https://klickaud.org/en15', desc: 'SoundCloud to MP3.', color: 'from-orange-400 to-orange-500', platforms: ['soundcloud'], formats: ['mp3'], recommended: true },
  { name: 'SSSTik', url: 'https://ssstik.io/', desc: 'X/Twitter video downloader.', color: 'from-sky-400 to-sky-500', platforms: ['twitter'], formats: ['mp4'], recommended: true },
  { name: 'Twitsave', url: 'https://twitsave.com/en', desc: 'Save X/Twitter videos in HD.', color: 'from-indigo-500 to-indigo-600', platforms: ['twitter'], formats: ['mp4'] },
  { name: 'SaveInsta', url: 'https://www.saveinsta.app/', desc: 'Instagram photos and videos.', color: 'from-pink-400 to-pink-500', platforms: ['instagram'], formats: ['mp4'], recommended: true },
  { name: 'iGram', url: 'https://igram.io/', desc: 'Instagram reels and stories.', color: 'from-purple-500 to-purple-600', platforms: ['instagram'], formats: ['mp4'] },
  { name: 'SpotDown', url: 'https://spotdown.org/', desc: 'Spotify tracks to MP3.', color: 'from-green-500 to-green-600', platforms: ['spotify'], formats: ['mp3'], recommended: true },
  { name: 'DeezLoad', url: 'https://deezerdownloader.net/', desc: 'Deezer tracks to MP3.', color: 'from-purple-500 to-purple-600', platforms: ['deezer'], formats: ['mp3'], recommended: true },
  { name: 'AM Downloader', url: 'https://apple-music-downloader.com/', desc: 'Apple Music to MP3.', color: 'from-gray-600 to-gray-800', platforms: ['applemusic'], formats: ['mp3'], recommended: true },
  { name: 'TTSave', url: 'https://ttsave.app/', desc: 'TikTok videos without watermark.', color: 'from-pink-500 to-pink-600', platforms: ['tiktok'], formats: ['mp4'], recommended: true },
  { name: 'SnapTik', url: 'https://snaptik.app/en3', desc: 'TikTok to MP4, no watermark.', color: 'from-cyan-500 to-cyan-600', platforms: ['tiktok'], formats: ['mp4'] },
  { name: 'FBDown', url: 'https://fbdown.net/', desc: 'Facebook videos in HD.', color: 'from-blue-600 to-blue-700', platforms: ['facebook'], formats: ['mp4'], recommended: true },
  { name: 'VDFR', url: 'https://vdfr.app/snapchat-video-downloader', desc: 'Download Snapchat videos.', color: 'from-yellow-400 to-yellow-500', platforms: ['snapchat'], formats: ['mp4'], recommended: true },
  { name: 'ViewSnapStories', url: 'https://viewsnapstories.com/video-downloader', desc: 'Save Snapchat videos fast.', color: 'from-yellow-500 to-yellow-600', platforms: ['snapchat'], formats: ['mp4'] },
  { name: 'BeReal Saver', url: 'https://berealsaver.com/', desc: 'Download BeReal photos and videos.', color: 'from-gray-900 to-black', platforms: ['br'], formats: ['mp4'] },
];

export function getConverterByName(name: string): Converter | undefined {
  return ALL_CONVERTERS.find(c => c.name === name);
}

/** 2xx and 3xx responses mean the site answered; anything else is not usable. */
export function statusFromHttpStatus(status: number): ConverterStatus {
  return status >= 200 && status < 400 ? 'working' : 'unavailable';
}

const CHECK_TIMEOUT_MS = 5000;
const CHECK_USER_AGENT = 'Mozilla/5.0 (compatible; YTConvertHealthCheck/1.0)';

async function probeOnce(url: string, method: 'HEAD' | 'GET'): Promise<number> {
  const response = await fetch(url, {
    method,
    redirect: 'follow',
    headers: { 'User-Agent': CHECK_USER_AGENT, Accept: '*/*' },
    signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
  });
  // Drain/cancel the body so the connection can be reused; we only need the
  // status code for a GET probe.
  try {
    await response.body?.cancel();
  } catch {
    // body already consumed or cancelled — fine either way
  }
  return response.status;
}

/**
 * Probe a converter URL. HEAD is tried first (cheap); anything that doesn't
 * clearly answer 2xx/3xx falls back to a GET, because several converter sites
 * reject HEAD requests or answer them with a bot-challenge status.
 */
export async function checkConverterUrl(
  url: string,
): Promise<{ status: ConverterStatus; statusCode?: number; latencyMs?: number; error?: string }> {
  const startedAt = Date.now();
  try {
    try {
      const headStatus = await probeOnce(url, 'HEAD');
      if (statusFromHttpStatus(headStatus) === 'working') {
        return { status: 'working', statusCode: headStatus, latencyMs: Date.now() - startedAt };
      }
    } catch {
      // HEAD failed (timeout, refused, ...) — the GET probe decides.
    }
    const getStatus = await probeOnce(url, 'GET');
    return {
      status: statusFromHttpStatus(getStatus),
      statusCode: getStatus,
      latencyMs: Date.now() - startedAt,
    };
  } catch (err) {
    return {
      status: 'unavailable',
      latencyMs: Date.now() - startedAt,
      error: err instanceof Error && err.name === 'TimeoutError' ? 'Timed out' : 'Could not connect',
    };
  }
}

export const STATUS_CACHE_TTL_MS = 15 * 60 * 1000;

// In-memory cache shared by every route that needs converter health. Like the
// other stores in this project it is per-serverless-instance; that is fine for
// a soft freshness cache (worst case: one extra probe round per instance).
let statusCache: { at: number; results: ConverterCheckResult[] } | null = null;
let inflightCheck: Promise<ConverterCheckResult[]> | null = null;

export interface ConverterStatusReport {
  results: ConverterCheckResult[];
  checkedAt: number;
  stale: boolean;
}

/**
 * Note a new user report so already-cached status results reflect it right
 * away instead of waiting for the next probe round.
 */
export function registerConverterReport(name: string): void {
  if (!statusCache) return;
  statusCache = {
    ...statusCache,
    results: statusCache.results.map(result =>
      result.name === name ? { ...result, reports: result.reports + 1 } : result,
    ),
  };
}

async function runChecks(): Promise<ConverterCheckResult[]> {
  const reportCounts = (await import('./stats')).getReportCounts();
  const results = await Promise.all(
    ALL_CONVERTERS.map(async converter => {
      const outcome = await checkConverterUrl(converter.url);
      return {
        name: converter.name,
        url: converter.url,
        status: outcome.status,
        checkedAt: Date.now(),
        statusCode: outcome.statusCode,
        latencyMs: outcome.latencyMs,
        error: outcome.error,
        reports: reportCounts[converter.name] || 0,
      } satisfies ConverterCheckResult;
    }),
  );
  return results;
}

/**
 * Get converter availability, checking (or re-checking) only when the cache
 * is older than STATUS_CACHE_TTL_MS. Concurrent callers share a single probe
 * round via the inflight promise.
 */
export async function getConverterStatusReport(): Promise<ConverterStatusReport> {
  const now = Date.now();
  if (statusCache && now - statusCache.at < STATUS_CACHE_TTL_MS) {
    return { results: statusCache.results, checkedAt: statusCache.at, stale: false };
  }

  if (!inflightCheck) {
    inflightCheck = runChecks()
      .then(results => {
        statusCache = { at: Date.now(), results };
        return results;
      })
      .finally(() => {
        inflightCheck = null;
      });
  }

  const results = await inflightCheck;
  return {
    results,
    checkedAt: statusCache?.at ?? now,
    stale: !statusCache || now - statusCache.at >= STATUS_CACHE_TTL_MS,
  };
}
