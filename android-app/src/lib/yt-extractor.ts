// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Typed bridge to the native YTExtractor Capacitor plugin (Kotlin, registered
 * in MainActivity). The plugin runs Innertube extraction over the phone's own
 * connection — same-egress, no server in the middle — and hands back ONE
 * allowlist-checked stream URL; `download` saves it via the system
 * DownloadManager into Downloads/YTConvert.
 *
 * The UI never calls these unless runtime.extractorReady() is true: in a
 * plain browser the plugin is unimplemented and every call would reject.
 */
import { registerPlugin } from '@capacitor/core';

export interface NativeExtractOptions {
  url: string;
  /** 'video' → progressive MP4, 'audio' → original audio track. */
  format: 'video' | 'audio';
  /** 'best' | numeric height (video) / kbps (audio), website-compatible. */
  quality: string;
}

export interface NativeExtractResult {
  videoId: string;
  title: string;
  /** Direct stream URL; already passed the on-device SSRF allowlist. */
  url: string;
  mimeType: string;
  extension: string;
  qualityLabel?: string;
  height?: number;
  bitrate?: number;
  /** Innertube client that minted the URL (diagnostics). */
  sourceClient: string;
  /** Honest caveat, e.g. "on-device muxing arrives later" above 360p. */
  note?: string;
}

export interface NativeDownloadOptions {
  url: string;
  title: string;
  extension: string;
  mimeType: string;
}

export interface NativeDownloadResult {
  downloadId: number;
  filename: string;
}

export interface NativePingResult {
  ok: boolean;
  version: number;
  /** True once the on-device adaptive remux step lands; false for the MVP. */
  muxing: boolean;
}

interface YTExtractorPlugin {
  ping(): Promise<NativePingResult>;
  extract(options: NativeExtractOptions): Promise<NativeExtractResult>;
  download(options: NativeDownloadOptions): Promise<NativeDownloadResult>;
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

/**
 * One-line summary of a successful download for the status row. Honest about
 * what was actually saved: original audio stays M4A/AAC (no MP3 transcode on
 * the phone), and a combined-stream audio download is labelled MP4.
 */
export function describeDownloadedFile(result: NativeExtractResult, download: NativeDownloadResult): string {
  const quality = result.qualityLabel
    ? ` (${result.qualityLabel})`
    : result.bitrate
      ? ` (${Math.round(result.bitrate / 1000)} kbps)`
      : '';
  return `Downloading “${result.title}”${quality} as ${download.filename} — watch progress in the notification; it lands in Downloads/YTConvert.`;
}
