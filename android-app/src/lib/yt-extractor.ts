// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Typed bridge to the native YTExtractor Capacitor plugin (Kotlin, registered
 * in MainActivity). The plugin runs Innertube extraction over the phone's own
 * connection — same-egress, no server in the middle — and hands back either
 * one allowlist-checked stream or an adaptive H.264/AAC pair. `download` saves
 * or stream-copy muxes it in the background directly into MediaStore.Downloads
 * (Android 10+) or Downloads/YTConvert (Android 6–9); a combined-stream audio
 * fallback has only its AAC track stream-copied into an audio-only M4A — never
 * the whole video. Progress notifications AND a `downloadProgress` listener
 * keep the UI informed.
 *
 * The UI never calls these unless runtime.extractorReady() is true: in a
 * plain browser the plugin is unimplemented and every call would reject.
 */
import { registerPlugin } from '@capacitor/core';
import { targetInfo, type DownloadTarget } from './formats';

export interface NativeExtractOptions {
  url: string;
  /** 'video' → progressive or on-device-combined MP4; 'audio' → original track. */
  format: 'video' | 'audio';
  /** 'best' | numeric height (video) / kbps (audio), website-compatible. */
  quality: string;
  /**
   * Output file type from the format picker ('m4a' | 'mp3' | 'wav' | 'flac' |
   * 'opus' | 'mp4'). Drives what download() saves; transcode targets are
   * re-encoded on the device, M4A/MP4 stay stream-copies.
   */
  target?: DownloadTarget;
}

export interface NativeExtractResult {
  videoId: string;
  title: string;
  /** Progressive/original stream, or the adaptive video track. */
  url: string;
  /** Adaptive AAC track when the selected video needs an on-device remux. */
  audioUrl?: string;
  mimeType: string;
  extension: string;
  /** Source byte total used only for progress; omitted when Innertube lacks it. */
  totalBytes?: number;
  /** True when download() will combine separate compressed tracks. */
  muxing: boolean;
  /**
   * True when the only source is a progressive MP4 (video+AAC) and download()
   * will stream-copy just its AAC track into an audio-only M4A.
   */
  extractAudio?: boolean;
  qualityLabel?: string;
  height?: number;
  bitrate?: number;
  /** Innertube client that minted the URL (diagnostics). */
  sourceClient: string;
  /** Honest container/processing note shown by callers when useful. */
  note?: string;
}

export interface NativeDownloadOptions {
  url: string;
  audioUrl?: string;
  totalBytes?: number;
  title: string;
  extension: string;
  mimeType: string;
  /** True for the combined-stream audio fallback: save an audio-only M4A. */
  extractAudio?: boolean;
  /** Output file type from the format picker ('m4a'|'mp3'|'wav'|'flac'|'opus'|'mp4'). */
  target?: string;
  /** True when the service must decode + re-encode into `target` on-device. */
  transcode?: boolean;
  /** 'best' | numeric kbps from the bitrate row, applied to the encoder. */
  audioBitrate?: string;
}

export interface NativeDownloadResult {
  downloadId: number;
  filename: string;
  muxing: boolean;
  extractAudio?: boolean;
  /** Echo of the requested output file type. */
  target?: string;
  /** True when the phone decodes + re-encodes the audio for this job. */
  transcoding?: boolean;
}

export interface NativePingResult {
  ok: boolean;
  version: number;
  /** True when adaptive H.264/AAC tracks can be combined on this device. */
  muxing: boolean;
  /** True from the background-download step on. */
  backgroundDownloads: boolean;
  /** Android API level of this device, for encoder feature gating. */
  apiLevel?: number;
}

export type NativeDownloadState = 'progress' | 'completed' | 'failed' | 'cancelled';

/** One `downloadProgress` event from the foreground service. */
export interface DownloadProgressEvent {
  downloadId: number;
  state: NativeDownloadState;
  filename: string;
  title: string;
  receivedBytes: number;
  totalBytes: number;
  /** Whole percent, or -1 while the total length is unknown. */
  percent: number;
  /** True while separate adaptive tracks are being combined on-device. */
  muxing: boolean;
  /** True while only the AAC track is being saved as an audio-only M4A. */
  extractAudio: boolean;
  /** True while the audio is being decoded + re-encoded on this device. */
  transcoding?: boolean;
  /** Set when state is 'failed'. */
  error?: string;
}

export interface PluginListenerHandle {
  remove: () => Promise<void>;
}

interface YTExtractorPlugin {
  ping(): Promise<NativePingResult>;
  extract(options: NativeExtractOptions): Promise<NativeExtractResult>;
  download(options: NativeDownloadOptions): Promise<NativeDownloadResult>;
  cancelDownload(options: { downloadId: number }): Promise<{ ok: boolean }>;
  addListener(
    eventName: 'downloadProgress',
    listener: (event: DownloadProgressEvent) => void,
  ): Promise<PluginListenerHandle>;
}

export const EXTRACTOR_PLUGIN = 'YTExtractor';

export const YTExtractor = registerPlugin<YTExtractorPlugin>(EXTRACTOR_PLUGIN);

/**
 * Honest, visitor-facing wording for anything extract()/download() can throw.
 * The native side already produces user-ready sentences (bot check, age gate,
 * allowlist refusal, permission denial); this keeps them and only cushions
 * transport noise so the UI never shows a raw stack message.
 */
export function describeExtractionFailure(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const msg = raw.replace(/^Error:\s*/i, '').trim();
  if (!msg || /^unimplemented$/i.test(msg)) {
    return 'On-device extraction is not available in this shell. Try one of the free Android apps below.';
  }
  if (/not available in this shell|plugin .* missing/i.test(msg)) {
    return 'On-device extraction is not available in this shell. Try one of the free Android apps below.';
  }
  return msg;
}

/** Compact byte count — mirrors DownloadJob.humanBytes() in Kotlin. */
export function humanBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return unit === 0 ? `${bytes} ${units[0]}` : `${value.toFixed(1)} ${units[unit]}`;
}

/** Progress row under the download button; honest about unknown lengths. */
export function describeProgressLine(event: DownloadProgressEvent): string {
  const action = event.transcoding
    ? 'Converting on this phone'
    : event.extractAudio
      ? 'Saving audio'
      : event.muxing
        ? 'Combining on device'
        : '';
  if (event.percent >= 0 && event.totalBytes > 0) {
    const prefix = action ? `${action} · ` : '';
    return `${prefix}${event.percent}% · ${humanBytes(event.receivedBytes)} of ${humanBytes(event.totalBytes)}`;
  }
  return `${action || 'Downloading'}… ${humanBytes(event.receivedBytes)}`;
}

/**
 * One-line summary of a successful start for the status row. Honest about
 * what is actually saved: M4A is the original AAC stream-copied (a combined
 * source has just its AAC track copied — never the whole video), MP4 is
 * stream-copied or combined, and every other target is decoded and
 * re-encoded on this device.
 */
export function describeDownloadedFile(result: NativeExtractResult, download: NativeDownloadResult): string {
  const quality = result.qualityLabel
    ? ` (${result.qualityLabel})`
    : result.bitrate
      ? ` (${Math.round(result.bitrate / 1000)} kbps)`
      : '';
  const info = targetInfo(download.target ?? '');
  const how = info !== null && info.transcode
    ? ` It is decoded and re-encoded into ${info.label} on this phone${info.bitrateRelevant ? ' at the chosen bitrate' : ''} — a small quality loss is unavoidable.`
    : result.extractAudio
      ? ' Its AAC track is stream-copied into an audio-only M4A — no re-encoding.'
      : '';
  return `Downloading “${result.title}”${quality} in the background — progress in the notification bar, file lands in Downloads/YTConvert/${download.filename}.${how}`;
}
