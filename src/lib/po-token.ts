/**
 * Optional client for an external PO-token sidecar (po-token-server/).
 *
 * HARD BOUNDARY: this app never emulates BotGuard. Tokens are minted by the
 * sidecar with bgutils-js and attached to Innertube / media requests.
 *
 * Contract (must match po-token-server/contract.js):
 *   POST /api/token  { videoId?, client, context: session|player|gvs, visitorData?, bypassCache? }
 *   Response: { visitorData, poToken, context, videoId, client }
 *
 * Tokens are validated against the real WebPO shape. Arbitrary lengths are
 * never accepted as a workaround.
 */

import {
  isValidClient,
  isValidContext,
  isValidPoToken,
  isValidVideoId,
  isValidVisitorData,
  type TokenContext,
} from './po-token-contract';

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;

export interface PoToken {
  visitorData: string;
  poToken: string;
  fetchedAt: number;
  context: TokenContext;
  videoId: string | null;
  client: string;
}

export interface GetPoTokenOptions {
  videoId?: string | null;
  client?: string;
  context?: TokenContext;
  visitorData?: string | null;
  forceRefresh?: boolean;
}

function configFromEnv(): { url: string; auth: string } | null {
  const url = (process.env.PO_TOKEN_SERVER_URL || '').trim().replace(/\/$/, '');
  const auth = (process.env.PO_TOKEN_SERVER_AUTH || '').trim();
  if (!url || !auth) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  } catch {
    return null;
  }
  return { url, auth };
}

export function isPoTokenServerConfigured(): boolean {
  return configFromEnv() !== null;
}

const cached = new Map<string, PoToken>();
const pending = new Map<string, Promise<PoToken | null>>();

export function __resetPoTokenCacheForTests(): void {
  cached.clear();
  pending.clear();
}

function cacheKey(opts: GetPoTokenOptions): string {
  return `${opts.context || 'session'}:${opts.client || 'ANDROID'}:${opts.videoId || ''}`;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function fetchPoToken(opts: GetPoTokenOptions): Promise<PoToken | null> {
  const config = configFromEnv();
  if (!config) return null;

  const context: TokenContext = opts.context && isValidContext(opts.context) ? opts.context : 'session';
  const client = opts.client && isValidClient(opts.client) ? opts.client : 'ANDROID';
  const videoId = opts.videoId && isValidVideoId(opts.videoId) ? opts.videoId : null;
  const visitorDataIn = opts.visitorData && isValidVisitorData(opts.visitorData) ? opts.visitorData : null;

  if (context === 'player' && !videoId) return null;

  const endpoint = `${config.url}/api/token`;
  const body = {
    videoId,
    client,
    context,
    visitorData: visitorDataIn,
    bypassCache: Boolean(opts.forceRefresh),
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.auth}`,
        'User-Agent': 'Mozilla/5.0 (compatible; YTConvert/1.0)',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as Record<string, unknown>;
    const payload =
      data && typeof data === 'object' && data.response && typeof data.response === 'object'
        ? (data.response as Record<string, unknown>)
        : data;

    const visitorData = asString(payload.visitorData) || asString(payload.visitor_data);
    const poToken = asString(payload.poToken) || asString(payload.po_token);

    // Strict shape check — never accept "any string of any length".
    if (!isValidVisitorData(visitorData) || !isValidPoToken(poToken)) return null;

    return {
      visitorData,
      poToken,
      fetchedAt: Date.now(),
      context,
      videoId,
      client,
    };
  } catch {
    return null;
  }
}

export async function getPoToken(
  forceRefreshOrOptions: boolean | GetPoTokenOptions = false,
): Promise<PoToken | null> {
  if (!isPoTokenServerConfigured()) return null;

  const opts: GetPoTokenOptions =
    typeof forceRefreshOrOptions === 'boolean'
      ? { forceRefresh: forceRefreshOrOptions, context: 'session', client: 'ANDROID' }
      : forceRefreshOrOptions;

  const key = cacheKey(opts);
  if (opts.forceRefresh) {
    cached.delete(key);
    pending.delete(key);
  } else {
    const hit = cached.get(key);
    if (hit && Date.now() - hit.fetchedAt < DEFAULT_TTL_MS) return hit;
  }

  const existing = pending.get(key);
  if (existing) return existing;

  const job = fetchPoToken(opts)
    .then(token => {
      if (token) cached.set(key, token);
      return token;
    })
    .finally(() => {
      pending.delete(key);
    });
  pending.set(key, job);
  return job;
}
