/*
 * YT Convert for Android — GPLv3 companion app.
 * Copyright (C) 2026 rahmanjimmy504-code
 *
 * TypeScript bridge to the native YTExtractor Capacitor plugin.
 *
 * MVP contract (build plan step 2): the Kotlin side is an *empty* plugin that
 * reports `available: false` and throws NOT_IMPLEMENTED for extraction, so the
 * UI can render its honest disabled state today and light up unchanged once
 * NewPipeExtractor lands in step 5. No network access happens in this file.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version. See <https://www.gnu.org/licenses/>.
 */

import { registerPlugin, Capacitor } from '@capacitor/core';
import type { VideoQualityPlan } from './formats';

export interface ExtractorStatus {
  /** True once the native extractor can actually resolve streams. */
  available: boolean;
  /** Short human-readable reason shown in the UI when unavailable. */
  reason?: string;
  /** Implementation name, e.g. "stub" or "newpipe-extractor 0.24.x". */
  engine?: string;
}

export interface MediaInfo {
  title: string;
  author: string;
  thumbnail: string;
  duration: string;
  views: string;
  published: string;
  platform: string;
  /** Which video qualities the device can actually deliver for this link. */
  videoQualityPlans?: VideoQualityPlan[];
}

export interface DownloadRequest {
  url: string;
  format: 'mp3' | 'mp4';
  quality: string;
  title?: string;
}

export interface DownloadHandle {
  /** Opaque id used to cancel the foreground download. */
  id: string;
}

export interface DownloadProgressEvent {
  id: string;
  /** 0–100, or -1 when the total size is unknown. */
  percent: number;
  bytesWritten: number;
  totalBytes: number;
}

export interface DownloadCompleteEvent {
  id: string;
  /** MediaStore content:// URI of the saved file. */
  uri: string;
  /** Honest container label, e.g. "m4a", "webm", "mp4". */
  container: string;
  displayName: string;
}

export interface DownloadFailedEvent {
  id: string;
  message: string;
}

export interface YTExtractorPlugin {
  /** Whether on-device extraction is usable right now. */
  getStatus(): Promise<ExtractorStatus>;
  /** Resolve public metadata for a link, entirely on the device. */
  getInfo(options: { url: string }): Promise<MediaInfo>;
  /** Start a foreground download; progress arrives via plugin events. */
  startDownload(options: DownloadRequest): Promise<DownloadHandle>;
  /** Cancel an in-flight download started by startDownload. */
  cancelDownload(options: { id: string }): Promise<void>;
  addListener(
    eventName: 'downloadProgress',
    listenerFunc: (event: DownloadProgressEvent) => void,
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: 'downloadComplete',
    listenerFunc: (event: DownloadCompleteEvent) => void,
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: 'downloadFailed',
    listenerFunc: (event: DownloadFailedEvent) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

/**
 * Web fallback so `npm run dev` in a desktop browser behaves exactly like the
 * MVP APK: the extractor is simply not available, and the UI says so.
 */
const webFallback: YTExtractorPlugin = {
  async getStatus() {
    return {
      available: false,
      engine: 'web',
      reason: 'On-device extraction runs only in the Android app.',
    };
  },
  async getInfo() {
    throw new Error('NOT_IMPLEMENTED');
  },
  async startDownload() {
    throw new Error('NOT_IMPLEMENTED');
  },
  async cancelDownload() {
    /* nothing to cancel on the web */
  },
  async addListener() {
    return { remove: async () => {} };
  },
};

export const YTExtractor = registerPlugin<YTExtractorPlugin>('YTExtractor', {
  web: () => webFallback,
});

export function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

/** Never throws: a plugin that is missing is just "unavailable". */
export async function readExtractorStatus(): Promise<ExtractorStatus> {
  try {
    return await YTExtractor.getStatus();
  } catch (err) {
    return {
      available: false,
      reason: err instanceof Error ? err.message : 'Extractor unavailable',
    };
  }
}
