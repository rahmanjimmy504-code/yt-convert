import { describe, expect, it } from 'vitest';
import {
  extensionForMime,
  isGoogleVideoUrl,
  pickYouTubeFormat,
  sanitizeDownloadFilename,
  type PlayerFormat,
} from './youtube-formats';

const GV = 'https://rr1---sn-abc.googlevideo.com/videoplayback?id=1';
const GV2 = 'https://rr2---sn-xyz.googlevideo.com/videoplayback?id=2';
const GV_AUDIO = 'https://rr3---sn-aaa.googlevideo.com/videoplayback?id=a';
const GV_OPUS = 'https://rr4---sn-bbb.googlevideo.com/videoplayback?id=o';

const formats: PlayerFormat[] = [
  {
    url: GV,
    mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
    qualityLabel: '360p',
    audioQuality: 'AUDIO_QUALITY_LOW',
    height: 360,
    bitrate: 500_000,
    itag: 18,
  },
  {
    url: GV2,
    mimeType: 'video/mp4; codecs="avc1.64001F, mp4a.40.2"',
    qualityLabel: '720p',
    audioQuality: 'AUDIO_QUALITY_MEDIUM',
    height: 720,
    bitrate: 2_500_000,
    itag: 22,
  },
  {
    url: 'https://rr5---sn-ccc.googlevideo.com/videoplayback?id=vonly',
    mimeType: 'video/mp4; codecs="avc1.640028"',
    qualityLabel: '1080p',
    height: 1080,
    bitrate: 4_000_000,
    itag: 137,
  },
  {
    url: GV_AUDIO,
    mimeType: 'audio/mp4; codecs="mp4a.40.2"',
    audioQuality: 'AUDIO_QUALITY_MEDIUM',
    bitrate: 128_000,
    itag: 140,
  },
  {
    url: GV_OPUS,
    mimeType: 'audio/webm; codecs="opus"',
    audioQuality: 'AUDIO_QUALITY_HIGH',
    bitrate: 160_000,
    itag: 251,
  },
  {
    url: 'https://evil.example/video.mp4',
    mimeType: 'video/mp4; codecs="avc1.64001F, mp4a.40.2"',
    qualityLabel: '1080p',
    audioQuality: 'AUDIO_QUALITY_MEDIUM',
    height: 1080,
    bitrate: 9_000_000,
    itag: 999,
  },
];

describe('isGoogleVideoUrl', () => {
  it('accepts https googlevideo hosts', () => {
    expect(isGoogleVideoUrl(GV)).toBe(true);
    expect(isGoogleVideoUrl('https://googlevideo.com/videoplayback')).toBe(true);
  });

  it('rejects non-https, lookalikes, credentials, and other hosts', () => {
    expect(isGoogleVideoUrl('http://rr1.googlevideo.com/videoplayback')).toBe(false);
    expect(isGoogleVideoUrl('https://googlevideo.com.evil.example/x')).toBe(false);
    expect(isGoogleVideoUrl('https://notgooglevideo.com/x')).toBe(false);
    expect(isGoogleVideoUrl('https://user:pass@rr1.googlevideo.com/x')).toBe(false);
    expect(isGoogleVideoUrl('https://example.com/videoplayback')).toBe(false);
    expect(isGoogleVideoUrl('not a url')).toBe(false);
  });
});

describe('pickYouTubeFormat', () => {
  it('picks the highest progressive MP4 that includes audio', () => {
    const picked = pickYouTubeFormat(formats, 'video');
    expect(picked?.itag).toBe(22);
    expect(picked?.url).toBe(GV2);
    expect(picked?.height).toBe(720);
  });

  it('ignores video-only adaptive MP4 even when it is higher resolution', () => {
    const picked = pickYouTubeFormat(formats, 'video');
    expect(picked?.height).not.toBe(1080);
    expect(picked?.itag).not.toBe(137);
  });

  it('rejects non-googlevideo URLs even if they look like a better progressive file', () => {
    const picked = pickYouTubeFormat(formats, 'video');
    expect(picked?.url).not.toContain('evil.example');
  });

  it('prefers m4a/AAC audio over higher-bitrate opus/webm', () => {
    const picked = pickYouTubeFormat(formats, 'audio');
    expect(picked?.itag).toBe(140);
    expect(picked?.url).toBe(GV_AUDIO);
    expect(picked?.mimeType).toMatch(/audio\/mp4/);
  });

  it('falls back to other audio-only googlevideo formats when no m4a exists', () => {
    const opusOnly = formats.filter(f => f.itag === 251);
    const picked = pickYouTubeFormat(opusOnly, 'audio');
    expect(picked?.itag).toBe(251);
  });

  it('returns null when nothing usable remains', () => {
    expect(pickYouTubeFormat([], 'video')).toBeNull();
    expect(
      pickYouTubeFormat(
        [{ url: 'https://example.com/a.mp4', mimeType: 'video/mp4', audioQuality: 'x', height: 720 }],
        'video',
      ),
    ).toBeNull();
  });
});

describe('extensionForMime / sanitizeDownloadFilename', () => {
  it('never labels AAC as mp3', () => {
    expect(extensionForMime('audio/mp4; codecs="mp4a.40.2"', 'm4a')).toBe('m4a');
    expect(extensionForMime('audio/aac', 'm4a')).toBe('m4a');
    expect(extensionForMime('audio/mpeg', 'm4a')).toBe('mp3');
    expect(extensionForMime('video/mp4', 'mp4')).toBe('mp4');
  });

  it('builds a safe download filename', () => {
    expect(sanitizeDownloadFilename('My Video: "Hello"/World', 'm4a')).toBe('My Video HelloWorld.m4a');
    expect(sanitizeDownloadFilename('', 'mp4')).toBe('download.mp4');
  });
});
