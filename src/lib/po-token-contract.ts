/**
 * Mirror of po-token-server/contract.js so the Next.js app validates tokens
 * with the same rules (no arbitrary-length workaround).
 */

export const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export const TOKEN_CONTEXTS = ['session', 'player', 'gvs'] as const;
export type TokenContext = (typeof TOKEN_CONTEXTS)[number];

export const INNERTUBE_CLIENTS = [
  'ANDROID',
  'ANDROID_MUSIC',
  'IOS',
  'IOS_MUSIC',
  'ANDROID_VR',
  'VISIONOS',
  'WEB_EMBEDDED_PLAYER',
  'WEB',
  'WEB_REMIX',
  'TVHTML5',
  'MWEB',
] as const;

const B64 = /^[A-Za-z0-9+/_-]+=*$/;

export const VISITOR_DATA_MIN = 20;
export const VISITOR_DATA_MAX = 160;
export const PO_TOKEN_MIN = 64;
export const PO_TOKEN_MAX = 512;

export function isValidVideoId(value: string): boolean {
  return typeof value === 'string' && VIDEO_ID_RE.test(value);
}

export function isValidClient(value: string): boolean {
  return (INNERTUBE_CLIENTS as readonly string[]).includes(value);
}

export function isValidContext(value: string): value is TokenContext {
  return (TOKEN_CONTEXTS as readonly string[]).includes(value);
}

export function isValidVisitorData(value: string): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length < VISITOR_DATA_MIN || trimmed.length > VISITOR_DATA_MAX) return false;
  if (!B64.test(trimmed)) return false;
  if (/^(.)\1+$/.test(trimmed.replace(/=+$/, ''))) return false;
  return true;
}

export interface TokenRequest {
  videoId: string | null;
  client: string;
  context: TokenContext;
  visitorData: string | null;
  bypassCache: boolean;
}

export function parseTokenRequest(input: Record<string, unknown>): { ok: true; request: TokenRequest } | { ok: false; error: string } {
  const videoId = typeof input.videoId === 'string' ? input.videoId.trim() : '';
  const client = typeof input.client === 'string' ? input.client.trim().toUpperCase() : '';
  const context = typeof input.context === 'string' ? input.context.trim().toLowerCase() : 'session';
  const visitorData = typeof input.visitorData === 'string' ? input.visitorData.trim() : '';
  const bypassCache = input.bypassCache === true || input.bypassCache === '1' || input.bypassCache === 'true';

  if (context && !isValidContext(context)) {
    return { ok: false, error: 'context must be session, player, or gvs' };
  }
  if (client && !isValidClient(client)) {
    return { ok: false, error: 'unsupported Innertube client' };
  }
  if (videoId && !isValidVideoId(videoId)) {
    return { ok: false, error: 'videoId must be an 11-character YouTube id' };
  }
  if (visitorData && !isValidVisitorData(visitorData)) {
    return { ok: false, error: 'visitorData failed shape validation' };
  }
  if (context === 'player' && !videoId) {
    return { ok: false, error: 'player tokens require a videoId' };
  }

  return {
    ok: true,
    request: {
      videoId: videoId || null,
      client: client || 'ANDROID',
      context: (context || 'session') as TokenContext,
      visitorData: visitorData || null,
      bypassCache,
    },
  };
}

export function isValidPoToken(value: string): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length < PO_TOKEN_MIN || trimmed.length > PO_TOKEN_MAX) return false;
  if (!B64.test(trimmed)) return false;
  const payload = trimmed.replace(/=+$/, '');
  if (payload.length < PO_TOKEN_MIN - 4) return false;
  if (/^(.)\1+$/.test(payload)) return false;
  return true;
}
