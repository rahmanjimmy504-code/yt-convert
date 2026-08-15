// SPDX-License-Identifier: GPL-3.0-or-later
// Format/quality options mirrored from the website so the companion's pickers
// and (later) its native extractor speak the same values.

/** Audio bitrate options (kbps) shown in the UI. */
export const AUDIO_KBPS_OPTIONS = ['best', '320', '256', '192', '128', '64'] as const;
/** Video resolution options (height, without the p) shown in the UI. */
export const VIDEO_QUALITY_OPTIONS = ['best', '1080', '720', '480', '360'] as const;
export type AudioQuality = (typeof AUDIO_KBPS_OPTIONS)[number];
export type VideoQuality = (typeof VIDEO_QUALITY_OPTIONS)[number];
