#!/usr/bin/env node

import { spawn } from 'node:child_process';

const port = process.env.E2E_PORT || '3210';
const baseUrl = `http://127.0.0.1:${port}`;

const server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['next', 'start', '-p', port], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NODE_ENV: 'production' },
});

let output = '';
server.stdout.on('data', chunk => { output += chunk.toString(); });
server.stderr.on('data', chunk => { output += chunk.toString(); });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`, { cache: 'no-store' });
      if (response.ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error(`Server did not become ready.\n${output}`);
}

async function assertResponse(path, expectedStatus = 200) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual' });
  if (response.status !== expectedStatus) {
    throw new Error(`${path}: expected ${expectedStatus}, got ${response.status}`);
  }
  return response;
}

try {
  await waitForServer();

  const health = await assertResponse('/api/health');
  const healthBody = await health.json();
  if (healthBody.ok !== true || healthBody.status !== 'healthy') {
    throw new Error(`Unexpected health response: ${JSON.stringify(healthBody)}`);
  }
  if (!health.headers.get('cache-control')?.includes('no-store')) {
    throw new Error('Health endpoint must be non-cacheable.');
  }

  const home = await assertResponse('/');
  const html = await home.text();
  if (!html.includes('YT Convert')) throw new Error('Homepage title/content is missing.');
  if (!/<input\b/i.test(html) && !/<textarea\b/i.test(html)) {
    throw new Error('Homepage no longer exposes a link input control.');
  }
  if (!/<button\b/i.test(html)) throw new Error('Homepage no longer exposes interactive controls.');

  console.log('E2E smoke test passed: production server, health API, homepage and core controls are reachable.');
} finally {
  server.kill('SIGTERM');
  await sleep(200);
}
