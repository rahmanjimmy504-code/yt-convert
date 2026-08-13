/**
 * Optional same-egress path for YouTube.
 *
 * PO tokens only clear BotGuard when BotGuard (sidecar) and Innertube /
 * googlevideo (this app) leave from the same public IP. An Android phone
 * can be that IP for free (Termux HTTP proxy or Tailscale exit node).
 *
 * YT_EGRESS_PROXY is an http(s) proxy URL. Only YouTube-family hosts are
 * sent through it. SOCKS is not used: Termux tinyproxy is HTTP and undici's
 * ProxyAgent speaks HTTP CONNECT. Arbitrary / user-supplied proxy URLs are
 * rejected.
 */

const YT_SUFFIXES = [
  'youtube.com',
  'youtu.be',
  'googlevideo.com',
  'googleapis.com',
  'gstatic.com',
  'ytimg.com',
  'ggpht.com',
  'youtubekids.com',
];

export function parseEgressProxyUrl(raw: string | undefined): string | null {
  const value = (raw || '').trim();
  if (!value) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (!parsed.hostname) return null;
  return parsed.toString();
}

export function youtubeEgressProxyFromEnv(): string | null {
  return parseEgressProxyUrl(process.env.YT_EGRESS_PROXY);
}

export function isYouTubeEgressHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  return YT_SUFFIXES.some(suffix => h === suffix || h.endsWith(`.${suffix}`));
}

export function shouldUseYoutubeEgress(url: string): boolean {
  if (!youtubeEgressProxyFromEnv()) return false;
  try {
    return isYouTubeEgressHost(new URL(url).hostname);
  } catch {
    return false;
  }
}

let cachedAgent: { proxy: string; dispatcher: unknown } | null = null;

async function dispatcherFor(proxy: string): Promise<unknown> {
  if (cachedAgent?.proxy === proxy) return cachedAgent.dispatcher;
  const { ProxyAgent } = await import('undici');
  const dispatcher = new ProxyAgent(proxy);
  cachedAgent = { proxy, dispatcher };
  return dispatcher;
}

/**
 * fetch() that sends YouTube-family URLs through YT_EGRESS_PROXY when set.
 * All other URLs use the platform fetch (no proxy).
 */
export async function youtubeAwareFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  const url = typeof input === 'string' ? input : input.toString();
  const proxy = youtubeEgressProxyFromEnv();
  if (!proxy || !shouldUseYoutubeEgress(url)) {
    return fetch(input, init);
  }
  const dispatcher = await dispatcherFor(proxy);
  const { fetch: undiciFetch } = await import('undici');
  return undiciFetch(url, { ...(init as object), dispatcher } as never) as unknown as Response;
}

/** Test-only: drop the cached ProxyAgent. */
export function __resetYoutubeEgressForTests(): void {
  cachedAgent = null;
}

export function describeYoutubeEgress(): { enabled: boolean; proxyHost: string | null } {
  const proxy = youtubeEgressProxyFromEnv();
  if (!proxy) return { enabled: false, proxyHost: null };
  try {
    return { enabled: true, proxyHost: new URL(proxy).host };
  } catch {
    return { enabled: false, proxyHost: null };
  }
}

