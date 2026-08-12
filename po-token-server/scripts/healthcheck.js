#!/usr/bin/env node
/**
 * Container/local healthcheck. Hits /healthz and exits non-zero if the
 * server is not responding. Used by both the Dockerfile HEALTHCHECK and
 * `npm run healthcheck` for manual checks.
 */

const port = process.env.PORT || '4416';
const host = process.env.HOST && /^0\.0\.0\.0$/.test(process.env.HOST) ? '127.0.0.1' : '127.0.0.1';
const url = `http://${host}:${port}/healthz`;

const timeout = AbortSignal.timeout(4000);

try {
  const res = await fetch(url, { signal: timeout });
  if (!res.ok) {
    console.error(`healthcheck failed: HTTP ${res.status}`);
    process.exit(1);
  }
  const body = await res.json().catch(() => null);
  if (!body || body.ok !== true) {
    console.error('healthcheck failed: unexpected body');
    process.exit(1);
  }
  process.exit(0);
} catch (err) {
  console.error(`healthcheck failed: ${err?.message || err}`);
  process.exit(1);
}
