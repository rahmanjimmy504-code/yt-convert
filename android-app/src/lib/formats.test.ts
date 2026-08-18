// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  AUDIO_TARGETS,
  DEFAULT_TARGET,
  KIND_STORAGE_KEY,
  MIN_API_LEVEL,
  TARGETS,
  TARGET_STORAGE_KEY,
  VIDEO_TARGETS,
  androidNameForApi,
  isAudioTarget,
  isTranscodeTarget,
  isVideoTarget,
  parseStoredAudioTarget,
  parseStoredKind,
  targetAvailable,
  targetInfo,
  targetUnavailableReason,
} from './formats';

describe('target catalog', () => {
  it('offers exactly the on-device audio targets and MP4 video', () => {
    expect(AUDIO_TARGETS.map(t => t.key)).toEqual(['m4a', 'mp3', 'wav', 'flac', 'opus']);
    expect(VIDEO_TARGETS.map(t => t.key)).toEqual(['mp4']);
  });

  it('has self-consistent specs (extension matches key, labels unique)', () => {
    for (const t of [...AUDIO_TARGETS, ...VIDEO_TARGETS]) {
      expect(t.extension).toBe(t.key);
      expect(t.mimeType).not.toBe('');
      expect(t.description.length).toBeGreaterThan(10);
      expect(TARGETS[t.key]).toBe(t);
    }
    const labels = new Set([...AUDIO_TARGETS, ...VIDEO_TARGETS].map(t => t.label));
    expect(labels.size).toBe(AUDIO_TARGETS.length + VIDEO_TARGETS.length);
  });

  it('marks only M4A and MP4 as stream-copy; the rest re-encode', () => {
    expect(isTranscodeTarget('m4a')).toBe(false);
    expect(isTranscodeTarget('mp4')).toBe(false);
    for (const key of ['mp3', 'wav', 'flac', 'opus'] as const) {
      expect(isTranscodeTarget(key)).toBe(true);
      expect(TARGETS[key].transcode).toBe(true);
    }
  });

  it('defaults to original-quality M4A audio and MP4 video', () => {
    expect(DEFAULT_TARGET.audio).toBe('m4a');
    expect(DEFAULT_TARGET.video).toBe('mp4');
    expect(TARGETS[DEFAULT_TARGET.audio].transcode).toBe(false);
  });

  it('gates FLAC to API 31+ and Opus to API 29+ (mirrors FormatPicker.kt)', () => {
    expect(TARGETS.flac.minApiLevel).toBe(31);
    expect(TARGETS.opus.minApiLevel).toBe(29);
    expect(TARGETS.m4a.minApiLevel).toBe(MIN_API_LEVEL);
    expect(TARGETS.mp3.minApiLevel).toBe(MIN_API_LEVEL);
    expect(TARGETS.wav.minApiLevel).toBe(MIN_API_LEVEL);
    expect(TARGETS.mp4.minApiLevel).toBe(MIN_API_LEVEL);
  });

  it('keeps the minSdk floor consistent with the native build', () => {
    expect(MIN_API_LEVEL).toBe(23);
  });
});

describe('target guards', () => {
  it('classifies audio vs video vs unknown', () => {
    for (const t of AUDIO_TARGETS) expect(isAudioTarget(t.key)).toBe(true);
    expect(isAudioTarget('mp4')).toBe(false);
    expect(isAudioTarget('mkv')).toBe(false);
    expect(isVideoTarget('mp4')).toBe(true);
    expect(isVideoTarget('webm')).toBe(false);
    expect(isVideoTarget('m4a')).toBe(false);
    expect(targetInfo('webm')).toBeNull();
    expect(targetInfo('mp3')?.label).toBe('MP3');
  });

  it('makes encoder-gated targets unavailable below their API level', () => {
    // Android 9 (28): only the minSdk targets.
    expect(targetAvailable('m4a', 28)).toBe(true);
    expect(targetAvailable('mp3', 28)).toBe(true);
    expect(targetAvailable('wav', 28)).toBe(true);
    expect(targetAvailable('opus', 28)).toBe(false);
    expect(targetAvailable('flac', 28)).toBe(false);
    // Android 10 (29): Opus unlocks.
    expect(targetAvailable('opus', 29)).toBe(true);
    expect(targetAvailable('flac', 29)).toBe(false);
    // Android 12 (31): FLAC unlocks.
    expect(targetAvailable('flac', 31)).toBe(true);
  });

  it('is conservative while the device API level is unknown', () => {
    expect(targetAvailable('m4a', null)).toBe(true);
    expect(targetAvailable('mp3', null)).toBe(true);
    expect(targetAvailable('opus', null)).toBe(false);
    expect(targetAvailable('flac', null)).toBe(false);
    expect(targetUnavailableReason('m4a', null)).toBeNull();
    expect(targetUnavailableReason('flac', null)).toContain('device version unknown');
  });

  it('explains gate reasons in visitor language', () => {
    expect(targetUnavailableReason('opus', 28)).toBe('Needs Android 10+.');
    expect(targetUnavailableReason('flac', 28)).toBe('Needs Android 12+.');
    expect(targetUnavailableReason('opus', 29)).toBeNull();
    expect(androidNameForApi(31)).toBe('Android 12+');
  });
});

describe('stored picker state', () => {
  it('parses persisted kinds with a safe fallback', () => {
    expect(parseStoredKind('audio')).toBe('audio');
    expect(parseStoredKind('video')).toBe('video');
    expect(parseStoredKind(null)).toBe('video');
    expect(parseStoredKind('mkv')).toBe('video');
  });

  it('restores an audio target only when this device can encode it', () => {
    expect(parseStoredAudioTarget('mp3', 23)).toBe('mp3');
    expect(parseStoredAudioTarget('opus', 23)).toBe('m4a');
    expect(parseStoredAudioTarget('opus', 29)).toBe('opus');
    expect(parseStoredAudioTarget('flac', null)).toBe('m4a');
    expect(parseStoredAudioTarget('bogus', 34)).toBe('m4a');
    expect(parseStoredAudioTarget(null, 34)).toBe('m4a');
  });

  it('uses dedicated localStorage keys so legacy state cannot loop back', () => {
    expect(KIND_STORAGE_KEY).toBe('yt-convert-android-kind');
    expect(TARGET_STORAGE_KEY).toBe('yt-convert-android-target');
  });
});
