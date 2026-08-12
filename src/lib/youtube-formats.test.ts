import { describe, expect, it } from 'vitest';
import {
  AUDIO_KBPS_OPTIONS,
  VIDEO_QUALITY_OPTIONS,
  extensionForMime,
  isGoogleVideoUrl,
  isValidQuality,
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

const tieredVideo: PlayerFormat[] = [
  { url: GV, mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"', qualityLabel: '360p', audioQuality: 'AUDIO_QUALITY_LOW', height: 360, bitrate: 500_000, itag: 18 },
  { url: GV2, mimeType: 'video/mp4; codecs="avc1.4D401E, mp4a.40.2"', qualityLabel: '480p', audioQuality: 'AUDIO_QUALITY_MEDIUM', height: 480, bitrate: 1_000_000, itag: 35 },
  { url: 'https://rr6---sn-ddd.googlevideo.com/videoplayback?id=720', mimeType: 'video/mp4; codecs="avc1.64001F, mp4a.40.2"', qualityLabel: '720p', audioQuality: 'AUDIO_QUALITY_MEDIUM', height: 720, bitrate: 2_500_000, itag: 22 },
  { url: 'https://rr7---sn-eee.googlevideo.com/videoplayback?id=1080', mimeType: 'video/mp4; codecs="avc1.640028, mp4a.40.2"', qualityLabel: '1080p', audioQuality: 'AUDIO_QUALITY_HIGH', height: 1080, bitrate: 5_000_000, itag: 999 },
];

const tieredAudio: PlayerFormat[] = [
  { url: 'https://a1.googlevideo.com/a?id=64', mimeType: 'audio/mp4; codecs="mp4a.40.2"', audioQuality: 'AUDIO_QUALITY_LOW', bitrate: 64_000, itag: 1 },
  { url: 'https://a2.googlevideo.com/a?id=128', mimeType: 'audio/mp4; codecs="mp4a.40.2"', audioQuality: 'AUDIO_QUALITY_MEDIUM', bitrate: 128_000, itag: 2 },
  { url: 'https://a3.googlevideo.com/a?id=256', mimeType: 'audio/mp4; codecs="mp4a.40.2"', audioQuality: 'AUDIO_QUALITY_HIGH', bitrate: 256_000, itag: 3 },
];

describe('quality selection', () => {
  it('picks the highest progressive video when quality is best or unrecognized', () => {
    expect(pickYouTubeFormat(tieredVideo, 'video', 'best')?.height).toBe(1080);
    expect(pickYouTubeFormat(tieredVideo, 'video', '')?.height).toBe(1080);
    expect(pickYouTubeFormat(tieredVideo, 'video')?.height).toBe(1080);
  });

  it('picks the closest video height at or below the target', () => {
    expect(pickYouTubeFormat(tieredVideo, 'video', '720')?.height).toBe(720);
    expect(pickYouTubeFormat(tieredVideo, 'video', '480')?.height).toBe(480);
    // 1080 requested but no progressive 1080-with-audio: fall back to 720.
    expect(pickYouTubeFormat(tieredVideo, 'video', '360')?.height).toBe(360);
  });

  it('falls back to the lowest available resolution when the target is below all', () => {
    expect(pickYouTubeFormat(tieredVideo, 'video', '240')?.height).toBe(360);
  });

  it('picks the highest audio bitrate when quality is best', () => {
    expect(pickYouTubeFormat(tieredAudio, 'audio', 'best')?.bitrate).toBe(256_000);
  });

  it('picks the closest audio bitrate at or below the target kbps', () => {
    expect(pickYouTubeFormat(tieredAudio, 'audio', '128')?.bitrate).toBe(128_000);
    expect(pickYouTubeFormat(tieredAudio, 'audio', '192')?.bitrate).toBe(128_000);
    expect(pickYouTubeFormat(tieredAudio, 'audio', '320')?.bitrate).toBe(256_000);
  });

  it('falls back to the lowest available bitrate when the target is below all', () => {
    expect(pickYouTubeFormat(tieredAudio, 'audio', '32')?.bitrate).toBe(64_000);
  });

  it('validates the quality option against the format', () => {
    expect(isValidQuality('mp3', 'best')).toBe(true);
    expect(isValidQuality('mp3', '320')).toBe(true);
    expect(isValidQuality('mp3', '1080')).toBe(false);
    expect(isValidQuality('mp4', '720')).toBe(true);
    expect(isValidQuality('mp4', '320')).toBe(false);
    expect(isValidQuality('mp4', 'highest')).toBe(false);
    expect([...AUDIO_KBPS_OPTIONS]).toContain('320');
    expect([...VIDEO_QUALITY_OPTIONS]).toContain('1080');
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
