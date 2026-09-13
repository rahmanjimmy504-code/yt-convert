import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('GET /api/health', () => {
  it('returns a cache-free liveness response', async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.service).toBe('yt-convert');
    expect(body.status).toBe('healthy');
    expect(typeof body.timestamp).toBe('string');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
});
