export const FORMAT_KEYS = ['flac', 'mp3', 'm4a', 'aac', 'opus', 'mp4'] as const;
export type FormatKey = (typeof FORMAT_KEYS)[number];

export const PLATFORM_KEYS = [
  'youtube', 'youtubemusic', 'soundcloud', 'twitter', 'instagram',
  'spotify', 'deezer', 'applemusic', 'amazonmusic', 'tiktok',
  'facebook', 'snapchat', 'br',
] as const;
export type PlatformKey = (typeof PLATFORM_KEYS)[number];

export interface VideoQualityPlan {
  quality: string;
  label?: string;
  kind?: 'progressive' | 'mux' | 'none' | string;
  height?: number;
}

export interface VideoInfo {
  title: string;
  author: string;
  thumbnail: string;
  duration: string;
  views: string;
  published: string;
  platform: PlatformKey;
  canConvert?: boolean;
  convertReason?: string;
  convertTicket?: string;
  videoQualityPlans?: VideoQualityPlan[];
  muxing?: boolean;
  transcoding?: boolean;
}

export interface ApiError {
  error: string;
  code?: string;
  retryable?: boolean;
  canConvert?: boolean;
  retryAfterSeconds?: number;
}

export class YtConvertApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;

  constructor(message: string, status: number, details: ApiError = { error: message }) {
    super(message);
    this.name = 'YtConvertApiError';
    this.status = status;
    this.code = details.code;
    this.retryable = details.retryable ?? (status === 408 || status === 425 || status === 429 || status >= 500);
    this.retryAfterSeconds = details.retryAfterSeconds;
  }
}

export interface ClientOptions {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
}

export interface LookupOptions {
  captchaToken?: string;
  youtubeCookies?: string;
}

export interface DownloadOptions extends LookupOptions {
  format: FormatKey;
  quality?: string;
  title?: string;
}

export interface DownloadFromInfoOptions {
  format: FormatKey;
  quality?: string;
  title?: string;
}

export interface YtConvertClient {
  lookup(url: string, options?: LookupOptions): Promise<VideoInfo>;
  download(url: string, options: DownloadOptions): Promise<Response>;
  downloadFromInfo(info: VideoInfo, url: string, options: DownloadFromInfoOptions): Promise<Response>;
  getDownloadUrl(url: string, info: VideoInfo, options: DownloadFromInfoOptions): string;
  downloadBlob(url: string, options: DownloadOptions): Promise<Blob>;
  downloadArrayBuffer(url: string, options: DownloadOptions): Promise<ArrayBuffer>;
  health(): Promise<{ ok: boolean; service: string; status: string; timestamp: string }>;
}

function normalizeBaseUrl(baseUrl: string): string {
  const value = baseUrl.trim();
  if (!value) throw new Error('YT Convert SDK: baseUrl is required.');
  const parsed = new URL(value);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('YT Convert SDK: baseUrl must use http:// or https://.');
  }
  return parsed.origin;
}

function assertFormat(format: string): asserts format is FormatKey {
  if (!FORMAT_KEYS.includes(format as FormatKey)) {
    throw new Error(`YT Convert SDK: unsupported format "${format}".`);
  }
}

async function readApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as Partial<ApiError>;
    if (typeof body.error === 'string') return body as ApiError;
  } catch {
    // Fall through to generic HTTP error.
  }
  return {
    error: `YT Convert API request failed with HTTP ${response.status}.`,
    retryable: response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500,
  };
}

function buildPath(baseUrl: string, path: string, params: Record<string, string>): string {
  const url = new URL(path, `${baseUrl}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

export function createYtConvertClient(options: ClientOptions): YtConvertClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('YT Convert SDK: a fetch implementation is required.');
  }

  async function lookup(url: string, lookupOptions: LookupOptions = {}): Promise<VideoInfo> {
    const cleanUrl = url.trim();
    if (!cleanUrl) throw new Error('YT Convert SDK: url is required.');

    const captchaToken = lookupOptions.captchaToken?.trim();
    if (!captchaToken) {
      throw new Error('YT Convert SDK: captchaToken is required. Complete the CAPTCHA challenge and pass the returned token.');
    }

    const endpoint = buildPath(baseUrl, '/api/video-info', { url: cleanUrl });
    const response = await fetchImpl(endpoint, {
      headers: {
        Accept: 'application/json',
        'X-Captcha-Token': captchaToken,
        ...(lookupOptions.youtubeCookies ? { 'X-YouTube-Cookies': lookupOptions.youtubeCookies } : {}),
      },
    });

    if (!response.ok) {
      const error = await readApiError(response);
      throw new YtConvertApiError(error.error, response.status, error);
    }

    return (await response.json()) as VideoInfo;
  }

  function getDownloadUrl(url: string, info: VideoInfo, downloadOptions: DownloadFromInfoOptions): string {
    assertFormat(downloadOptions.format);
    if (!info.convertTicket) {
      throw new Error('YT Convert SDK: VideoInfo does not contain a convertTicket. Run lookup() first.');
    }

    return buildPath(baseUrl, '/api/convert', {
      url: url.trim(),
      format: downloadOptions.format,
      quality: downloadOptions.quality ?? 'best',
      ticket: info.convertTicket,
      title: downloadOptions.title ?? info.title ?? '',
    });
  }

  async function downloadFromInfo(
    url: string,
    info: VideoInfo,
    downloadOptions: DownloadFromInfoOptions,
  ): Promise<Response> {
    const endpoint = getDownloadUrl(url, info, downloadOptions);
    const response = await fetchImpl(endpoint, {
      headers: { Accept: 'application/octet-stream, audio/*, video/*, application/json' },
    });

    if (!response.ok) {
      const error = await readApiError(response);
      throw new YtConvertApiError(error.error, response.status, error);
    }

    return response;
  }

  async function download(url: string, downloadOptions: DownloadOptions): Promise<Response> {
    const info = await lookup(url, downloadOptions);
    return downloadFromInfo(info, url, downloadOptions);
  }

  async function downloadBlob(url: string, downloadOptions: DownloadOptions): Promise<Blob> {
    const response = await download(url, downloadOptions);
    return response.blob();
  }

  async function downloadArrayBuffer(url: string, downloadOptions: DownloadOptions): Promise<ArrayBuffer> {
    const response = await download(url, downloadOptions);
    return response.arrayBuffer();
  }

  async function health(): Promise<{ ok: boolean; service: string; status: string; timestamp: string }> {
    const response = await fetchImpl(new URL('/api/health', `${baseUrl}/`).toString(), {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      const error = await readApiError(response);
      throw new YtConvertApiError(error.error, response.status, error);
    }

    return (await response.json()) as { ok: boolean; service: string; status: string; timestamp: string };
  }

  return {
    lookup,
    download,
    downloadFromInfo,
    getDownloadUrl,
    downloadBlob,
    downloadArrayBuffer,
    health,
  };
}

export default createYtConvertClient;
