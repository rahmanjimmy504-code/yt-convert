/**
 * Optional client for an external PO-token ("proof of origin") server.
 *
 * HARD BOUNDARY: this app never emulates YouTube's BotGuard / PO-token
 * generation itself — that requires executing YouTube's VM and is both
 * fragile and against the project's privacy rules. Instead, an operator can
 * run a small sidecar microservice (see po-token-server/) that performs the
 * attestation and exposes a simple authenticated JSON endpoint; this client
 * calls it and attaches the resulting tokens to Innertube player requests.
 *
 * The feature is fully opt-in and disabled unless BOTH:
 *   - PO_TOKEN_SERVER_URL is set, and
 *   - PO_TOKEN_SERVER_AUTH is set (a bearer token the sidecar requires).
 *
 * Tokens are cached in-memory for a short TTL only (the same process, never
 * persisted) and are never logged.
 */

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const REQUEST_TIMEOUT_MS = 8_000;

export interface PoToken {
  /** Visitor data (context.client.visitorData) tied to the token. */
  visitorData: string;
  /** The content-bound or session-bound proof-of-origin token. */
  poToken: string;
  /** Wall-clock time (ms) at which this token was fetched. */
  fetchedAt: number;
}

interface PoTokenResponse {
  visitorData?: unknown;
  poToken?: unknown;
  // Alternate field names used by the various open-source generators.
  visitor_data?: unknown;
  po_token?: unknown;
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

/** True when an external PO-token server is configured and should be used. */
export function isPoTokenServerConfigured(): boolean {
  return configFromEnv() !== null;
}

let cachedToken: PoToken | null = null;
let pending: Promise<PoToken | null> | null = null;

/** Test-only hook: forget any cached token between unit tests. */
export function __resetPoTokenCacheForTests(): void {
  cachedToken = null;
  pending = null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Fetch a fresh (visitorData, poToken) pair from the configured server.
 *
 * The server contract intentionally mirrors the most common open-source
 * generators (e.g. lighttube-org/pot-generator GET /generate, and the iv-org
 * trusted-session-generator one-shot JSON), accepting either camelCase or
 * snake_case field names so an operator can point at either implementation.
 *
 * Returns null on any failure — a missing token must never break extraction,
 * because the Innertube clients still work for many videos without it.
 */
async function fetchPoToken(): Promise<PoToken | null> {
  const config = configFromEnv();
  if (!config) return null;

  // Prefer a content-bound endpoint when the video id is known; fall back to
  // the generic visitor-data token. The path /api/token matches the sidecar
  // shipped in po-token-server/; other generators expose /generate or /, so
  // try the documented endpoint first.
  const endpoint = `${config.url}/api/token`;

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${config.auth}`,
        'User-Agent': 'Mozilla/5.0 (compatible; YTConvert/1.0)',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as PoTokenResponse | { response?: PoTokenResponse };

    // Some generators wrap the payload in { success, response: {...} }.
    const payload: PoTokenResponse =
      data && typeof data === 'object' && 'response' in data && data.response
        ? (data.response as PoTokenResponse)
        : (data as PoTokenResponse);

    const visitorData =
      asString(payload.visitorData) || asString(payload.visitor_data);
    const poToken = asString(payload.poToken) || asString(payload.po_token);

    if (!visitorData || !poToken) return null;
    return { visitorData, poToken, fetchedAt: Date.now() };
  } catch {
    return null;
  }
}

/**
 * Return a usable PO token, fetching and caching one when necessary. Multiple
 * concurrent callers share a single in-flight request so a cold cache doesn't
 * stampede the sidecar.
 *
 * Pass `forceRefresh` to bypass the cache and mint a brand-new token. This is
 * what the bot-challenge retry in ./extract.ts uses: when YouTube answers
 * "Sign in to confirm you're not a bot" the cached token has been burnt (or
 * was never bound to this session), so reusing it would fail identically.
 */
export async function getPoToken(forceRefresh = false): Promise<PoToken | null> {
  if (!isPoTokenServerConfigured()) return null;

  if (forceRefresh) {
    // Drop the burnt token and any in-flight fetch that would resolve to it,
    // so the retry genuinely re-attests instead of replaying the same value.
    cachedToken = null;
    pending = null;
  } else if (cachedToken && Date.now() - cachedToken.fetchedAt < DEFAULT_TTL_MS) {
    return cachedToken;
  }

  if (pending) return pending;
  pending = fetchPoToken()
    .then(token => {
      if (token) cachedToken = token;
      return token;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}
