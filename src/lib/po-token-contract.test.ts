import { describe, expect, it } from 'vitest';
import { isValidPoToken, isValidVideoId, isValidVisitorData, parseTokenRequest } from './po-token-contract';

describe('sidecar token request contract', () => {
  it('requires videoId for player tokens', () => {
    const parsed = parseTokenRequest({ context: 'player' });
    expect(parsed.ok).toBe(false);
  });

  it('accepts a full player request', () => {
    const parsed = parseTokenRequest({
      videoId: 'dQw4w9WgXcQ',
      client: 'android',
      context: 'player',
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.request.client).toBe('ANDROID');
      expect(parsed.request.videoId).toBe('dQw4w9WgXcQ');
    }
  });

  it('rejects unknown clients and contexts', () => {
    expect(parseTokenRequest({ client: 'FAKE' }).ok).toBe(false);
    expect(parseTokenRequest({ context: 'magic' }).ok).toBe(false);
  });

  it('defaults session context without a video id', () => {
    const parsed = parseTokenRequest({});
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.request.context).toBe('session');
  });
});

describe('id / token helpers', () => {
  it('validates YouTube video ids', () => {
    expect(isValidVideoId('dQw4w9WgXcQ')).toBe(true);
    expect(isValidVideoId('short')).toBe(false);
  });

  it('does not treat length alone as validity', () => {
    expect(isValidVisitorData('x'.repeat(40))).toBe(false);
    expect(isValidPoToken('x'.repeat(80))).toBe(false);
  });
});
