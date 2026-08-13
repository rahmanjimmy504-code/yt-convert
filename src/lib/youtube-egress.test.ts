import { afterEach, describe, expect, it } from 'vitest';
import {
  __resetYoutubeEgressForTests,
  isYouTubeEgressHost,
  parseEgressProxyUrl,
  shouldUseYoutubeEgress,
  youtubeEgressProxyFromEnv,
} from './youtube-egress';

const SAVED = { ...process.env };

afterEach(() => {
  process.env = { ...SAVED };
  __resetYoutubeEgressForTests();
});

describe('parseEgressProxyUrl', () => {
  it('accepts http(s) proxies only', () => {
    expect(parseEgressProxyUrl('http://127.0.0.1:8888')).toBe('http://127.0.0.1:8888/');
    expect(parseEgressProxyUrl('https://proxy.example:8443')).toBe('https://proxy.example:8443/');
    expect(parseEgressProxyUrl('socks5://127.0.0.1:1080')).toBeNull();
    expect(parseEgressProxyUrl('file:///etc/passwd')).toBeNull();
    expect(parseEgressProxyUrl('not a url')).toBeNull();
    expect(parseEgressProxyUrl('')).toBeNull();
  });
});

describe('isYouTubeEgressHost', () => {
  it('matches YouTube and googlevideo only', () => {
    expect(isYouTubeEgressHost('www.youtube.com')).toBe(true);
    expect(isYouTubeEgressHost('rr1---sn-test.googlevideo.com')).toBe(true);
    expect(isYouTubeEgressHost('jnn-pa.googleapis.com')).toBe(true);
    expect(isYouTubeEgressHost('example.com')).toBe(false);
    expect(isYouTubeEgressHost('youtube.com.evil.example')).toBe(false);
  });
});

describe('shouldUseYoutubeEgress', () => {
  it('is false when no proxy is configured', () => {
    delete process.env.YT_EGRESS_PROXY;
    expect(youtubeEgressProxyFromEnv()).toBeNull();
    expect(shouldUseYoutubeEgress('https://www.youtube.com/youtubei/v1/player')).toBe(false);
  });

  it('is true for YouTube hosts when a proxy is set', () => {
    process.env.YT_EGRESS_PROXY = 'http://127.0.0.1:8888';
    expect(shouldUseYoutubeEgress('https://www.youtube.com/youtubei/v1/player')).toBe(true);
    expect(shouldUseYoutubeEgress('https://rr1.googlevideo.com/videoplayback')).toBe(true);
    expect(shouldUseYoutubeEgress('https://pipedproxy-bom.kavin.rocks/x')).toBe(false);
  });
});
