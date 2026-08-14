/*
 * YT Convert for Android — GPLv3 companion app.
 * Copyright (C) 2026 rahmanjimmy504-code
 *
 * Adapted from the YT Convert website (src/lib/download-panel.ts),
 * dual-licensed by its copyright holder under the GNU General Public License
 * v3 or later for this repository. The "ticket" concept is gone on Android:
 * downloads run on the device, so no server-issued HMAC is involved.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version. See <https://www.gnu.org/licenses/>.
 */

import {
  canConvertPlatform,
  convertUnavailableReason,
  type PlatformKey,
} from './platforms';
import type { VideoQualityPlan } from './formats';

export type DownloadPanelState =
  /** Platform is convertible and the native extractor is available. */
  | { kind: 'ready' }
  /**
   * Platform is convertible but the native extractor has not returned usable
   * streams (MVP: the plugin is a stub). The panel stays visible with an
   * honest disabled state instead of vanishing.
   */
  | { kind: 'no-extractor' }
  /**
   * DRM-protected or no public file: no button, just the one-line reason
   * shown above the third-party converter list.
   */
  | { kind: 'unavailable'; reason: string };

/**
 * Decide what the "Download here" panel should show.
 *
 * `extractorReady` reflects whether the native Kotlin plugin reported that it
 * can extract this link on-device. The panel is shown whenever the *platform*
 * is convertible, independent of extractor readiness — that is what keeps it
 * from disappearing while the plugin is still a stub.
 */
export function deriveDownloadPanelState(
  platform: string | null | undefined,
  extractorReady: boolean,
): DownloadPanelState {
  if (!platform) return { kind: 'no-extractor' };
  if (!canConvertPlatform(platform as PlatformKey)) {
    return { kind: 'unavailable', reason: convertUnavailableReason(platform as PlatformKey) };
  }
  return extractorReady ? { kind: 'ready' } : { kind: 'no-extractor' };
}

/**
 * Honest notice for the MP4 quality picker: never silently downgrade.
 * Returns null when the selection is met, or when nothing is known yet.
 */
export function qualityDowngradeNote(
  plan: VideoQualityPlan | undefined,
  quality: string,
): string | null {
  if (!plan) return null;
  const numeric = /^\d+$/.test(quality);
  const label = numeric ? `${quality}p` : 'Best quality';
  const delivered = plan.height || 0;

  if (plan.kind === 'mux') {
    const got = delivered ? ` The closest single-file stream (${delivered}p) will be used for now.` : '';
    return `${label} needs combining separate video + audio tracks — not available yet.${got}`;
  }
  if (plan.kind === 'none') {
    return `${label} is not available for this video right now.`;
  }
  const requested = numeric ? parseInt(quality, 10) : delivered;
  if (delivered < requested) {
    if (delivered === 0) return `${label} is not available as a single file for this video right now.`;
    return `${label} is not available as a single file for this video — the highest available stream is ${delivered}p.`;
  }
  return null;
}
