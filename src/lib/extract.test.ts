import { describe, expect, it } from 'vitest';
import {
  extractInstagramShortcode,
  extractTikTokId,
  extractTweetId,
  twitterSyndicationToken,
} from './extract';

describe('id parsers', () => {
  it('extracts TikTok video ids', () => {
    expect(extractTikTokId('https://www.tiktok.com/@scout2015/video/6718335390845095173')).toBe(
      '6718335390845095173',
    );
    expect(extractTikTokId('https://www.tiktok.com/@x/video/6718335390845095173?is_copy_url=1')).toBe(
      '6718335390845095173',
    );
    expect(extractTikTokId('https://www.tiktok.com/@x')).toBeNull();
  });

  it('extracts tweet ids', () => {
    expect(extractTweetId('https://x.com/jack/status/20')).toBe('20');
    expect(extractTweetId('https://x.com/jack/status/1234567890123456789')).toBe('1234567890123456789');
    expect(extractTweetId('https://twitter.com/jack/statuses/1234567890123456789?s=20')).toBe(
      '1234567890123456789',
    );
    expect(extractTweetId('https://x.com/jack')).toBeNull();
  });

  it('extracts Instagram shortcodes', () => {
    expect(extractInstagramShortcode('https://www.instagram.com/reel/AbC123_-xy/')).toBe('AbC123_-xy');
    expect(extractInstagramShortcode('https://www.instagram.com/p/AbC123/')).toBe('AbC123');
    expect(extractInstagramShortcode('https://www.instagram.com/tv/AbC123/')).toBe('AbC123');
    expect(extractInstagramShortcode('https://www.instagram.com/user/')).toBeNull();
  });

  it('computes the public syndication token from a tweet id', () => {
    expect(twitterSyndicationToken('20')).toMatch(/^[a-z0-9]+$/);
    expect(twitterSyndicationToken('20')).toBe(twitterSyndicationToken('20'));
  });
});
