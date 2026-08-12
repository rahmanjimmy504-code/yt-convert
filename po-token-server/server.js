/**
 * PO-token sidecar for yt-convert.
 *
 * This microservice performs YouTube's BotGuard / proof-of-origin attestation
 * (via the `youtube-po-token-generator` library, which runs YouTube's VM in
 * jsdom) and hands the resulting { visitorData, poToken } to the main app
 * over an authenticated HTTP endpoint.
 *
 * The main yt-convert app NEVER generates these tokens itself — that is the
 * whole reason this sidecar exists. Keeping the attestation logic in a
 * separate, optionally-deployed process means the public site has no BotGuard
 * code at all, and an operator can run the sidecar on a different host/IP
 * (e.g. a cheap always-free ARM VM) from the web deployment.
 *
 * Endpoints:
 *   GET /healthz      -> 200 { ok: true } (unauthenticated, for load balancers)
 *   GET /api/token    -> 200 { visitorData, poToken } (requires Bearer auth)
 *
 * Configuration (environment):
 *   PORT            listen port (default 4416)
 *   AUTH_TOKEN      required bearer token; requests without it get 401
 *   TOKEN_TTL_MS    how long a minted token is reused (default 1800000 = 30m)
 *   HOST            bind address (default 0.0.0.0)
 */

import { createServer } from 'node:http';

const PORT = parseInt(process.env.PORT || '4416', 10);
const HOST = process.env.HOST || '0.0.0.0';
const AUTH_TOKEN = (process.env.AUTH_TOKEN || '').trim();
const TOKEN_TTL_MS = parseInt(process.env.TOKEN_TTL_MS || String(30 * 60 * 1000), 10);

if (!AUTH_TOKEN) {
  console.error('[po-token-server] FATAL: AUTH_TOKEN environment variable must be set.');
  process.exit(1);
}

/** @type {{ visitorData: string, poToken: string, at: number } | null} */
let cached = null;
let inFlight = null;

/**
 * Generate a fresh token pair. The library is imported lazily so a failed/
 * slow attestation never blocks startup (the /healthz endpoint stays up and
 * /api/token surfaces the error with a 502 instead of crashing the process).
 */
async function mint() {
  const { generate } = await import('youtube-po-token-generator');
  const { visitorData, poToken } = await generate();
  if (!visitorData || !poToken) {
    throw new Error('Generator returned an incomplete token pair');
  }
  return { visitorData, poToken, at: Date.now() };
}

async function getToken() {
  if (cached && Date.now() - cached.at < TOKEN_TTL_MS) return cached;
  if (inFlight) return inFlight;
  inFlight = mint()
    .then(token => {
      cached = token;
      console.log(`[po-token-server] minted a fresh token (visitorData length ${token.visitorData.length})`);
      return token;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
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

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/healthz') {
    send(res, 200, { ok: true, cached: Boolean(cached) });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/token') {
    // Constant-time-ish bearer check. The token is a shared secret, not a
    // password, but comparing without short-circuiting avoids leaking length
    // via timing.
    const auth = (req.headers['authorization'] || '').toString();
    const expected = `Bearer ${AUTH_TOKEN}`;
    let ok = auth.length === expected.length;
    for (let i = 0; i < auth.length && i < expected.length; i++) {
      if (auth.charCodeAt(i) !== expected.charCodeAt(i)) ok = false;
    }
    if (!ok) {
      send(res, 401, { error: 'unauthorized' });
      return;
    }

    getToken()
      .then(token => send(res, 200, { visitorData: token.visitorData, poToken: token.poToken }))
      .catch(err => {
        console.error('[po-token-server] token mint failed:', err?.message || err);
        send(res, 502, { error: 'token generation failed' });
      });
    return;
  }

  send(res, 404, { error: 'not found' });
});

server.listen(PORT, HOST, () => {
  console.log(`[po-token-server] listening on http://${HOST}:${PORT}`);
  console.log('[po-token-server] endpoints: GET /healthz, GET /api/token (Bearer auth)');
});

// Graceful shutdown so `docker stop` doesn't kill an in-flight attestation.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`[po-token-server] ${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
