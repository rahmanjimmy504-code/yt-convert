// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  registerPlugin: (name: string) => ({ __plugin: name }),
}));

const {
  YTExtractor,
  EXTRACTOR_PLUGIN,
  describeExtractionFailure,
  describeDownloadedFile,
  describeProgressLine,
  humanBytes,
} = await import('./yt-extractor');

describe('plugin registration', () => {
  it('registers under the exact name the Kotlin plugin uses', () => {
    expect(EXTRACTOR_PLUGIN).toBe('YTExtractor');
    expect((YTExtractor as unknown as { __plugin: string }).__plugin).toBe('YTExtractor');
  });
});

describe('describeExtractionFailure', () => {
  it('keeps the honest native messages (bot check, age gate, allowlist)', () => {
    expect(
      describeExtractionFailure(new Error('YouTube served a bot check (“Sign in to confirm you’re not a bot”) for this phone’s connection.')),
    ).toContain('bot check');
    expect(
      describeExtractionFailure(new Error('This video is age-restricted or private, so YouTube requires a signed-in account.')),
    ).toContain('age-restricted');
    expect(describeExtractionFailure(new Error('Refusing to download a host outside the on-device allowlist.'))).toContain(
      'allowlist',
    );
  });

  it('strips a leading Error: prefix', () => {
    expect(describeExtractionFailure(new Error('Error: Missing url.'))).toBe('Missing url.');
  });

  it('cushions empty or unimplemented failures with the free-app pointer', () => {
    expect(describeExtractionFailure(undefined)).toContain('free Android apps');
    expect(describeExtractionFailure(new Error('unimplemented'))).toContain('free Android apps');
    expect(describeExtractionFailure(new Error('"YTExtractor" plugin is not available in this shell'))).toContain(
      'free Android apps',
    );
  });

  it('accepts plain strings too', () => {
    expect(describeExtractionFailure('Storage permission is required to save downloads on this Android version.')).toContain(
      'Storage permission',
    );
  });
});

describe('describeDownloadedFile', () => {
  const base = {
    videoId: 'dQw4w9WgXcQ',
    url: 'https://rr1---sn-test.googlevideo.com/videoplayback',
    mimeType: 'video/mp4',
    extension: 'mp4',
    sourceClient: 'ANDROID_MUSIC',
    muxing: false,
  };

  it('names the destination folder and mentions the background service', () => {
    const msg = describeDownloadedFile(
      { ...base, title: 'Me at the zoo', qualityLabel: '360p' },
      { downloadId: 42, filename: 'Me at the zoo.mp4', muxing: false },
    );
    expect(msg).toContain('Me at the zoo');
    expect(msg).toContain('360p');
    expect(msg).toContain('Downloads/YTConvert');
    expect(msg).toContain('background');
  });

  it('reports audio bitrate when no quality label exists', () => {
    const msg = describeDownloadedFile(
      { ...base, title: 'Track', mimeType: 'audio/mp4', extension: 'm4a', bitrate: 129000 },
      { downloadId: 1, filename: 'Track.m4a', muxing: false },
    );
    expect(msg).toContain('129 kbps');
  });

  it('explains the audio-only M4A extraction for a combined-stream fallback', () => {
    const msg = describeDownloadedFile(
      { ...base, title: 'Label track', mimeType: 'audio/mp4', extension: 'm4a', extractAudio: true },
      { downloadId: 2, filename: 'Label track.m4a', muxing: false, extractAudio: true },
    );
    expect(msg).toContain('Label track.m4a');
    expect(msg).toContain('audio-only M4A');
    expect(msg).toContain('no re-encoding');
  });
});

describe('progress wording', () => {
  const event = {
    downloadId: 7,
    filename: 'Me at the zoo.mp4',
    title: 'Me at the zoo',
    receivedBytes: 0,
    totalBytes: -1,
    percent: -1,
    muxing: false,
    extractAudio: false,
  } as const;

  it('formats byte counts like the Kotlin side', () => {
    expect(humanBytes(0)).toBe('0 B');
    expect(humanBytes(512)).toBe('512 B');
    expect(humanBytes(1024)).toBe('1.0 KB');
    expect(humanBytes(1572864)).toBe('1.5 MB');
    expect(humanBytes(-1)).toBe('');
  });

  it('shows a real percentage once the length is known', () => {
    const line = describeProgressLine({
      ...event,
      state: 'progress',
      percent: 42,
      receivedBytes: 420000,
      totalBytes: 1000000,
    });
    expect(line).toBe('42% · 410.2 KB of 976.6 KB');
  });

  it('stays honest when the length is unknown', () => {
    const line = describeProgressLine({ ...event, state: 'progress', receivedBytes: 2048 });
    expect(line).toBe('Downloading… 2.0 KB');
    expect(line).not.toContain('%');
  });

  it('labels adaptive progress as on-device combining', () => {
    const line = describeProgressLine({
      ...event,
      state: 'progress',
      muxing: true,
      percent: 25,
      receivedBytes: 250000,
      totalBytes: 1000000,
    });
    expect(line).toContain('Combining on device');
    expect(line).toContain('25%');
  });

  it('labels audio-only extraction as saving audio when the length is unknown', () => {
    // The combined source length includes discarded video, so the service
    // reports an indeterminate total; the line must still say what is
    // happening — saving audio, never "Downloading" a video.
    const line = describeProgressLine({
      ...event,
      state: 'progress',
      extractAudio: true,
      receivedBytes: 131072,
    });
    expect(line).toBe('Saving audio… 128.0 KB');
    expect(line).not.toContain('%');
    expect(line).not.toContain('Downloading');
  });

  it('labels audio-only extraction with a percentage when a total is known', () => {
    const line = describeProgressLine({
      ...event,
      state: 'progress',
      extractAudio: true,
      percent: 50,
      receivedBytes: 500000,
      totalBytes: 1000000,
    });
    expect(line).toContain('Saving audio');
    expect(line).toContain('50%');
  });

  it('never shows combining copy for an audio-only extraction', () => {
    const line = describeProgressLine({
      ...event,
      state: 'progress',
      extractAudio: true,
      muxing: true,
      receivedBytes: 2048,
    });
    expect(line).toContain('Saving audio');
    expect(line).not.toContain('Combining on device');
  });
});
