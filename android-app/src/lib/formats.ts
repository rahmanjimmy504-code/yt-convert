/*
 * YT Convert for Android — GPLv3 companion app.
 * Copyright (C) 2026 rahmanjimmy504-code
 *
 * Quality options shown by the Download here panel. Mirrors the website's
 * src/lib/youtube-formats.ts option lists, without the server-side Innertube
 * format picker (which never runs in the app).
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version. See <https://www.gnu.org/licenses/>.
 */

/** Audio bitrate options (kbps, or "best") shown in the UI. */
export const AUDIO_KBPS_OPTIONS = ['best', '320', '256', '192', '128', '64'] as const;

/** Video resolution options (height, without the p) shown in the UI. */
export const VIDEO_QUALITY_OPTIONS = ['best', '1080', '720', '480', '360'] as const;

export type AudioQuality = (typeof AUDIO_KBPS_OPTIONS)[number];
export type VideoQuality = (typeof VIDEO_QUALITY_OPTIONS)[number];

/**
 * What a given video-quality option would require for this video. The native
 * extractor fills these in once NewPipeExtractor lands (build plan step 5+);
 * until then the UI shows no plan and never claims a quality it cannot meet.
 */
export interface VideoQualityPlan {
  quality: VideoQuality;
  kind: 'progressive' | 'mux' | 'none';
  height?: number;
}
