/**
 * Shared sidecar/main-app contract for PO tokens.
 *
 * Contexts:
 *   session — visitorData-bound GVS / session token (player + Innertube session)
 *   player  — content-bound player token (identifier = videoId)
 *   gvs     — media-URL / googlevideo token (identifier = visitorData)
 *
 * Tokens are never accepted on length alone. Visitor data and PO tokens must
 * match the shapes YouTube actually issues.
 */

export const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export const TOKEN_CONTEXTS = Object.freeze(['session', 'player', 'gvs']);

export const INNERTUBE_CLIENTS = Object.freeze([
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
]);

/** Base64 / base64url alphabet plus padding. */
const B64 = /^[A-Za-z0-9+/_-]+=*$/;

/**
 * YouTube visitorData is a protobuf encoded as URL-safe base64. Observed
 * lengths sit roughly in 20–160 characters; we allow a tight band around that.
 */
export const VISITOR_DATA_MIN = 20;
export const VISITOR_DATA_MAX = 160;

/**
 * WebPO tokens are BotGuard-minted base64 blobs. Observed player/GVS tokens
 * are typically ~80–220 characters. Anything outside 64–512 is not a real
 * WebPO token and must be rejected (no "any length" workaround).
 */
export const PO_TOKEN_MIN = 64;
export const PO_TOKEN_MAX = 512;

export function isValidVideoId(value) {
  return typeof value === 'string' && VIDEO_ID_RE.test(value);
}

export function isValidClient(value) {
  return typeof value === 'string' && INNERTUBE_CLIENTS.includes(value);
}

export function isValidContext(value) {
  return typeof value === 'string' && TOKEN_CONTEXTS.includes(value);
}

export function isValidVisitorData(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length < VISITOR_DATA_MIN || trimmed.length > VISITOR_DATA_MAX) return false;
  if (!B64.test(trimmed)) return false;
  if (/^(.)\1+$/.test(trimmed.replace(/=+$/, ''))) return false;
  return true;
}

export function isValidPoToken(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length < PO_TOKEN_MIN || trimmed.length > PO_TOKEN_MAX) return false;
  if (!B64.test(trimmed)) return false;
  // Reject all-padding or trivially repeated junk.
  const payload = trimmed.replace(/=+$/, '');
  if (payload.length < PO_TOKEN_MIN - 4) return false;
  if (/^(.)\1+$/.test(payload)) return false;
  return true;
}

/**
 * Parse a token request (GET query or POST JSON).
 * @returns {{ ok: true, request: TokenRequest } | { ok: false, error: string }}
 */
export function parseTokenRequest(input) {
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
      context: context || 'session',
      visitorData: visitorData || null,
      bypassCache,
    },
  };
}

export function assertTokenPair(visitorData, poToken) {
  if (!isValidVisitorData(visitorData)) {
    throw new Error('Generator returned invalid visitorData');
  }
  if (!isValidPoToken(poToken)) {
    throw new Error('Generator returned invalid poToken');
  }
}
