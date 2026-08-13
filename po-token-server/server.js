/**
 * PO-token sidecar for yt-convert (BgUtils-compatible).
 *
 * Mints YouTube WebPO tokens via bgutils-js + jsdom and returns them to the
 * main app over an authenticated HTTP API. The public Next.js app never
 * executes BotGuard itself.
 *
 * Endpoints:
 *   GET  /healthz      unauthenticated liveness
 *   GET  /api/token    session token (query: videoId, client, context, bypassCache)
 *   POST /api/token    JSON body with the same fields
 *
 * Contract: see contract.js
 */

import { createServer } from 'node:http';
import { parseTokenRequest, assertTokenPair } from './contract.js';
import { mintPoToken } from './mint.js';

const PORT = parseInt(process.env.PORT || '4416', 10);
const HOST = process.env.HOST || '0.0.0.0';
const AUTH_TOKEN = (process.env.AUTH_TOKEN || '').trim();
const TOKEN_TTL_MS = parseInt(process.env.TOKEN_TTL_MS || String(30 * 60 * 1000), 10);

if (!AUTH_TOKEN) {
  console.error('[po-token-server] FATAL: AUTH_TOKEN environment variable must be set.');
  process.exit(1);
}

/** @type {Map<string, { visitorData: string, poToken: string, at: number, context: string, videoId: string | null, client: string }>} */
const cache = new Map();
/** @type {Map<string, Promise<any>>} */
const inFlight = new Map();

function cacheKey(req) {
  return `${req.context}:${req.client}:${req.videoId || ''}:${req.visitorData || ''}`;
}

async function mint(req) {
  const identifier = req.context === 'player' ? req.videoId : req.visitorData || undefined;
  const minted = await mintPoToken({
    identifier,
    visitorData: req.visitorData || undefined,
  });
  assertTokenPair(minted.visitorData, minted.poToken);
  return {
    visitorData: minted.visitorData,
    poToken: minted.poToken,
    context: req.context,
    videoId: req.videoId,
    client: req.client,
    contentBinding: minted.contentBinding,
    at: Date.now(),
  };
}

async function getToken(req) {
  const key = cacheKey(req);
  if (!req.bypassCache) {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < TOKEN_TTL_MS) return cached;
    const pending = inFlight.get(key);
    if (pending) return pending;
  }

  const job = mint(req)
    .then(token => {
      cache.set(key, token);
      console.log(
        `[po-token-server] minted ${token.context} token for client=${token.client}` +
          (token.videoId ? ` video=${token.videoId}` : ''),
      );
      return token;
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, job);
  return job;
}

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(payload);
}

function authorize(req) {
  const auth = (req.headers['authorization'] || '').toString();
  const expected = `Bearer ${AUTH_TOKEN}`;
  let ok = auth.length === expected.length;
  for (let i = 0; i < auth.length && i < expected.length; i++) {
    if (auth.charCodeAt(i) !== expected.charCodeAt(i)) ok = false;
  }
  return ok;
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16_384) throw new Error('body too large');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function handleToken(req, res, fields) {
  if (!authorize(req)) {
    send(res, 401, { error: 'unauthorized' });
    return;
  }
  const parsed = parseTokenRequest(fields);
  if (!parsed.ok) {
    send(res, 400, { error: parsed.error });
    return;
  }
  getToken(parsed.request)
    .then(token =>
      send(res, 200, {
        visitorData: token.visitorData,
        poToken: token.poToken,
        context: token.context,
        videoId: token.videoId,
        client: token.client,
        contentBinding: token.contentBinding,
      }),
    )
    .catch(err => {
      console.error('[po-token-server] token mint failed:', err?.message || err);
      send(res, 502, { error: 'token generation failed' });
    });
}

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/healthz') {
    send(res, 200, { ok: true, cached: cache.size > 0, provider: 'bgutils-js' });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/token') {
    handleToken(req, res, {
      videoId: url.searchParams.get('videoId') || '',
      client: url.searchParams.get('client') || '',
      context: url.searchParams.get('context') || '',
      visitorData: url.searchParams.get('visitorData') || '',
      bypassCache: url.searchParams.get('bypassCache') || '',
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/token') {
    readJson(req)
      .then(body => handleToken(req, res, body && typeof body === 'object' ? body : {}))
      .catch(() => send(res, 400, { error: 'invalid json' }));
    return;
  }

  send(res, 404, { error: 'not found' });
});

server.listen(PORT, HOST, () => {
  console.log(`[po-token-server] listening on http://${HOST}:${PORT}`);
  console.log('[po-token-server] provider: bgutils-js  endpoints: GET /healthz, GET|POST /api/token');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`[po-token-server] ${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
