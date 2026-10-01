import test from 'node:test';
import assert from 'node:assert/strict';
import { createYtConvertClient, YtConvertApiError } from '../dist/index.js';

test('builds a ticketed download URL', () => {
  const client = createYtConvertClient({ baseUrl: 'https://example.com/' });
  const url = client.getDownloadUrl('https://www.youtube.com/watch?v=abc123', {
    title: 'Demo', author: 'Author', thumbnail: '', duration: '1:00', views: '1',
    published: '', platform: 'youtube', convertTicket: 'ticket-123',
  }, { format: 'mp3', quality: '192' });
  const parsed = new URL(url);
  assert.equal(parsed.pathname, '/api/convert');
  assert.equal(parsed.searchParams.get('format'), 'mp3');
  assert.equal(parsed.searchParams.get('quality'), '192');
  assert.equal(parsed.searchParams.get('ticket'), 'ticket-123');
  assert.equal(parsed.searchParams.get('title'), 'Demo');
});

test('rejects missing conversion tickets', () => {
  const client = createYtConvertClient({ baseUrl: 'https://example.com' });
  assert.throws(
    () => client.getDownloadUrl('https://www.youtube.com/watch?v=abc123', {
      title: 'Demo', author: '', thumbnail: '', duration: '', views: '', published: '', platform: 'youtube',
    }, { format: 'mp4' }),
    /does not contain a convertTicket/,
  );
});

test('exposes typed retryable API errors', async () => {
  const client = createYtConvertClient({
    baseUrl: 'https://example.com',
    fetch: async () => new Response(JSON.stringify({
      error: 'Please try again', code: 'UPSTREAM_TIMEOUT', retryable: true, retryAfterSeconds: 3,
    }), { status: 503, headers: { 'Content-Type': 'application/json' } }),
  });
  await assert.rejects(
    () => client.lookup('https://www.youtube.com/watch?v=abc123', { captchaToken: 'test' }),
    error => {
      assert.ok(error instanceof YtConvertApiError);
      assert.equal(error.status, 503);
      assert.equal(error.code, 'UPSTREAM_TIMEOUT');
      assert.equal(error.retryable, true);
      assert.equal(error.retryAfterSeconds, 3);
      return true;
    },
  );
});

test('health helper uses the public health endpoint', async () => {
  const client = createYtConvertClient({
    baseUrl: 'https://example.com',
    fetch: async input => {
      assert.equal(String(input), 'https://example.com/api/health');
      return new Response(JSON.stringify({
        ok: true, service: 'yt-convert', status: 'healthy', timestamp: '2026-01-01T00:00:00.000Z',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });
  const result = await client.health();
  assert.equal(result.ok, true);
  assert.equal(result.service, 'yt-convert');
});
