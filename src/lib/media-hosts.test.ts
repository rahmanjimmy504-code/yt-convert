import { describe, expect, it } from 'vitest';
import { isAllowedMediaUrl } from './media-hosts';

describe('media host SSRF allowlist', () => {
  it('allows reviewed HTTPS media hosts', () => {
    expect(isAllowedMediaUrl('https://video.googlevideo.com/videoplayback')).toBe(true);
    expect(isAllowedMediaUrl('https://c.ymcdn.org/file.mp3')).toBe(true);
  });

  it('rejects private IPs, credentials and plaintext URLs', () => {
    expect(isAllowedMediaUrl('http://example.com/file.mp3')).toBe(false);
    expect(isAllowedMediaUrl('https://127.0.0.1/file')).toBe(false);
    expect(isAllowedMediaUrl('https://user:pass@googlevideo.com/file')).toBe(false);
  });

  it('rejects lookalike domains', () => {
    expect(isAllowedMediaUrl('https://googlevideo.com.evil.example/file')).toBe(false);
    expect(isAllowedMediaUrl('https://evilgooglevideo.com/file')).toBe(false);
  });
});
