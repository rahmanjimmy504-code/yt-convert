import test from 'node:test';
import assert from 'node:assert/strict';
import { createYtConvertClient } from '../dist/index.js';

test('builds a ticketed download URL', () => {
  const client = createYtConvertClient({ baseUrl: 'https://example.com/' });
  const url = client.getDownloadUrl(
    'https://www.youtube.com/watch?v=abc123',
    {
      title: 'Demo',
      author: 'Author',
      thumbnail: '',
      duration: '1:00',
      views: '1',
      published: '',
      platform: 'youtube',
      convertTicket: 'ticket-123',
    },
    { format: 'mp3', quality: '192' },
  );

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
    () => client.getDownloadUrl(
      'https://www.youtube.com/watch?v=abc123',
      {
        title: 'Demo',
        author: '',
        thumbnail: '',
        duration: '',
        views: '',
        published: '',
        platform: 'youtube',
      },
      { format: 'mp4' },
    ),
    /convertTicket is missing/,
  );
});
