export const FORMAT_KEYS = ['flac', 'mp3', 'm4a', 'aac', 'opus', 'mp4'] as const;
export type FormatKey = (typeof FORMAT_KEYS)[number];

export const PLATFORM_KEYS = [
  'youtube',
  'youtubemusic',
  'soundcloud',
  'twitter',
  'instagram',
  'spotify',
  'deezer',
  'applemusic',
  'amazonmusic',
  'tiktok',
  'facebook',
  'snapchat',
  'br',
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

  constructor(message: string, status: number, details: ApiError = {}) {
    super(message);
    this.name = 'YtConvertApiError';
    this.status = status;
    this.code = details.code;
    this.retryable = details.retryable ?? status === 408 || status === 429 || status >= 500;
    this.retryAfterSeconds = details.retryAfterSeconds;
  }
}

export interface ClientOptions {
  /** Base URL of a running YT Convert deployment, e.g. https://example.com. */
  baseUrl: string;
  /** Optional fetch implementation for Node, browsers, tests, or custom runtimes. */
  fetch?: typeof globalThis.fetch;
}

export interface LookupOptions {
  /** CAPTCHA proof returned by the deployment's CAPTCHA flow. */
  captchaToken?: string;
  /** Optional sanitized YouTube session cookies supported by the deployment. */
  youtubeCookies?: string;
}

export interface DownloadOptions extends LookupOptions {
  format: FormatKey;
  quality?: string;
  /** Optional title used for the Content-Disposition filename. */
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
    // Fall through to the generic HTTP error.
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
    download: async (url, downloadOptions) => {
      const info = await lookup(url, downloadOptions);
      return downloadFromInfo(url, info, downloadOptions);
    },
    downloadFromInfo: async (info, url, downloadOptions) => downloadFromInfo(url, info, downloadOptions),
    getDownloadUrl,
    downloadBlob,
    downloadArrayBuffer,
    health,
  };
}

export default createYtConvertClient;
