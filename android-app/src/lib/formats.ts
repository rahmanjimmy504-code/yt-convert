// SPDX-License-Identifier: GPL-3.0-or-later
// Format/quality options mirrored from the website so the companion's pickers
// and its native extractor speak the same values.

/** Audio bitrate options (kbps) shown in the UI. */
export const AUDIO_KBPS_OPTIONS = ['best', '320', '256', '192', '128', '64'] as const;
/** Video resolution options (height, without the p) shown in the UI. */
export const VIDEO_QUALITY_OPTIONS = ['best', '1080', '720', '480', '360'] as const;
export type AudioQuality = (typeof AUDIO_KBPS_OPTIONS)[number];
export type VideoQuality = (typeof VIDEO_QUALITY_OPTIONS)[number];

/**
 * On-device output targets for the format picker.
 *
 * Audio: M4A stream-copies YouTube's original AAC (no re-encode); MP3/WAV/
 * FLAC/Opus are decoded and re-encoded on the phone. Video stays MP4 —
 * Android cannot mux MKV natively and a WebM re-encoder is not shipped.
 *
 * The API-level gates mirror the native FormatPicker.kt (kept in sync by
 * tests on both sides): the framework FLAC encoder is only relied on from
 * Android 12, the Opus encoder from Android 10. MP3 needs no framework
 * encoder — it uses the bundled LAME native library.
 */
export type MediaKind = 'audio' | 'video';
export type AudioTarget = 'm4a' | 'mp3' | 'wav' | 'flac' | 'opus';
export type VideoTarget = 'mp4';
export type DownloadTarget = AudioTarget | VideoTarget;

export interface TargetSpec {
  key: DownloadTarget;
  /** Chip label shown in the picker (uppercase file type). */
  label: string;
  kind: MediaKind;
  /** File extension the native service actually saves. */
  extension: string;
  mimeType: string;
  /** True when the phone must decode + re-encode (everything but M4A/MP4). */
  transcode: boolean;
  /** Minimum Android API level for this target (app minSdk is 23). */
  minApiLevel: number;
  /** Honest one-line description shown under the chips. */
  description: string;
  /** Whether the bitrate row changes the result of this target. */
  bitrateRelevant: boolean;
}

/** The app's minSdk, used as the "works everywhere" API floor. */
export const MIN_API_LEVEL = 23;

export const AUDIO_TARGETS: (TargetSpec & { key: AudioTarget })[] = [
  {
    key: 'm4a',
    label: 'M4A',
    kind: 'audio',
    extension: 'm4a',
    mimeType: 'audio/mp4',
    transcode: false,
    minApiLevel: MIN_API_LEVEL,
    description:
      'Original AAC audio, stream-copied without re-encoding — fastest and no quality loss.',
    bitrateRelevant: true,
  },
  {
    key: 'mp3',
    label: 'MP3',
    kind: 'audio',
    extension: 'mp3',
    mimeType: 'audio/mpeg',
    transcode: true,
    minApiLevel: MIN_API_LEVEL,
    description: 'Plays everywhere; re-encoded on this phone with the bundled LAME encoder.',
    bitrateRelevant: true,
  },
  {
    key: 'wav',
    label: 'WAV',
    kind: 'audio',
    extension: 'wav',
    mimeType: 'audio/x-wav',
    transcode: true,
    minApiLevel: MIN_API_LEVEL,
    description: 'Uncompressed PCM — perfect quality, very large files, no encoder needed.',
    bitrateRelevant: false,
  },
  {
    key: 'flac',
    label: 'FLAC',
    kind: 'audio',
    extension: 'flac',
    mimeType: 'audio/flac',
    transcode: true,
    minApiLevel: 31,
    description: 'Lossless compression, roughly half the size of WAV.',
    bitrateRelevant: false,
  },
  {
    key: 'opus',
    label: 'Opus',
    kind: 'audio',
    extension: 'opus',
    mimeType: 'audio/opus',
    transcode: true,
    minApiLevel: 29,
    description: 'Best quality per bit; saved in an Ogg container for modern players.',
    bitrateRelevant: true,
  },
];

export const VIDEO_TARGETS: (TargetSpec & { key: VideoTarget })[] = [
  {
    key: 'mp4',
    label: 'MP4',
    kind: 'video',
    extension: 'mp4',
    mimeType: 'video/mp4',
    transcode: false,
    minApiLevel: MIN_API_LEVEL,
    description: 'H.264 MP4 — compatible tracks are combined on this device without re-encoding.',
    bitrateRelevant: false,
  },
];

export const TARGETS: Record<DownloadTarget, TargetSpec> = Object.fromEntries(
  [...AUDIO_TARGETS, ...VIDEO_TARGETS].map(t => [t.key, t]),
) as Record<DownloadTarget, TargetSpec>;

/** Default target per kind: original-quality M4A audio, MP4 video. */
export const DEFAULT_TARGET: Record<MediaKind, DownloadTarget> = {
  audio: 'm4a',
  video: 'mp4',
};

export function targetInfo(target: string): TargetSpec | null {
  return (TARGETS as Record<string, TargetSpec>)[target] ?? null;
}

export function isAudioTarget(target: string): target is AudioTarget {
  return AUDIO_TARGETS.some(t => t.key === target);
}

export function isVideoTarget(target: string): target is VideoTarget {
  return target === 'mp4';
}

/** True when the phone must decode + re-encode for this target. */
export function isTranscodeTarget(target: string): boolean {
  const info = targetInfo(target);
  return info !== null && info.transcode;
}

/** Human name of the Android release a gate refers to ('' for minSdk). */
export function androidNameForApi(api: number): string {
  if (api >= 34) return 'Android 14+';
  if (api >= 33) return 'Android 13+';
  if (api >= 32) return 'Android 12L+';
  if (api >= 31) return 'Android 12+';
  if (api >= 30) return 'Android 11+';
  if (api >= 29) return 'Android 10+';
  return `Android ${api}+`;
}

/**
 * Whether this device can save [target]. A null apiLevel means unknown (the
 * ping() probe has not answered); targets that only need the app's minSdk
 * stay selectable, encoder-gated ones are conservatively unavailable.
 */
export function targetAvailable(target: string, apiLevel: number | null): boolean {
  const info = targetInfo(target);
  if (!info) return false;
  if (info.minApiLevel <= MIN_API_LEVEL) return true;
  return apiLevel !== null && apiLevel >= info.minApiLevel;
}

/** One-line reason a chip is disabled, or null when the target is available. */
export function targetUnavailableReason(target: string, apiLevel: number | null): string | null {
  const info = targetInfo(target);
  if (!info) return 'Unknown format.';
  if (info.minApiLevel <= MIN_API_LEVEL) return null;
  if (apiLevel === null) return `Needs ${androidNameForApi(info.minApiLevel)} (device version unknown).`;
  if (apiLevel < info.minApiLevel) return `Needs ${androidNameForApi(info.minApiLevel)}.`;
  return null;
}

/** localStorage keys for the persisted picker selection. */
export const KIND_STORAGE_KEY = 'yt-convert-android-kind';
export const TARGET_STORAGE_KEY = 'yt-convert-android-target';

/** Parse a stored kind value ('audio' | 'video'), with a fallback. */
export function parseStoredKind(value: string | null): MediaKind {
  return value === 'audio' || value === 'video' ? value : 'video';
}

/**
 * Parse a stored audio target, falling back to the nearest available one
 * when the value predates this picker (or the device cannot encode it).
 */
export function parseStoredAudioTarget(
  value: string | null,
  apiLevel: number | null,
): AudioTarget {
  if (value !== null && isAudioTarget(value) && targetAvailable(value, apiLevel)) return value;
  return 'm4a';
}
