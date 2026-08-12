// Pure UI logic for the first-party "Download here" panel shown on the ready
// result card. Kept separate from the component so the visibility/state rules
// can be unit-tested without rendering React.

import {
  canConvertPlatform,
  convertUnavailableReason,
  type PlatformKey,
} from './platforms';
import type { VideoQualityPlan } from './youtube-formats';

export type DownloadPanelState =
  /** Platform is convertible and a fresh ticket is present: button is live. */
  | { kind: 'ready' }
  /**
   * Platform is convertible (e.g. YouTube) but no ticket came back — usually a
   * 5xx / "Could not load info" fallback. The panel must stay visible with an
   * honest disabled state rather than vanishing (which hid the first-party
   * control even for supported platforms).
   */
  | { kind: 'no-ticket' }
  /**
   * Platform is DRM-protected or has no public file: no button, just the
   * one-line reason shown above the third-party converter list.
   */
  | { kind: 'unavailable'; reason: string };

/**
 * Decide what the "Download here" panel should show.
 *
 * `hasTicket` reflects whether the lookup returned an HMAC convert ticket.
 * The panel is shown whenever the *platform* is convertible
 * (`canConvertPlatform`), independent of runtime extraction success — that is
 * what keeps it from disappearing on a transient metadata failure.
 */
export function deriveDownloadPanelState(
  platform: string | null | undefined,
  hasTicket: boolean,
): DownloadPanelState {
  if (!platform) return { kind: 'no-ticket' };
  if (!canConvertPlatform(platform as PlatformKey)) {
    return { kind: 'unavailable', reason: convertUnavailableReason(platform as PlatformKey) };
  }
  return hasTicket ? { kind: 'ready' } : { kind: 'no-ticket' };
}

/**
 * Honest Phase 0 notice for the first-party MP4 quality picker.
 *
 * Returns a message when the requested quality cannot be delivered as a
 * single progressive file today (so the UI never silently downgrades), or
 * null when the selection is met — or when nothing is known (no plan).
 *
 * `plan.height` is the height the current single-file download actually
 * delivers, which may be below what the user asked for.
 */
export function qualityDowngradeNote(plan: VideoQualityPlan | undefined, quality: string): string | null {
  if (!plan) return null;
  const numeric = /^\d+$/.test(quality);
  const label = numeric ? `${quality}p` : 'Best quality';
  const delivered = plan.height || 0;

  if (plan.kind === 'mux') {
    // The requested height only exists as separate video + audio tracks, and
    // combining them is not implemented yet (see docs/hd-muxing-proposal.md).
    const got = delivered ? ` The closest single-file stream (${delivered}p) will be used for now.` : '';
    return `${label} needs combining separate video + audio tracks — not available yet.${got}`;
  }
  if (plan.kind === 'none') {
    return `${label} is not available for this video right now.`;
  }
  // A progressive plan that still misses the target: nothing better exists
  // (no adaptive tracks to combine), so say what ships instead.
  const requested = numeric ? parseInt(quality, 10) : delivered;
  if (delivered < requested) {
    if (delivered === 0) return `${label} is not available as a single file for this video right now.`;
    return `${label} is not available as a single file for this video — the highest available stream is ${delivered}p.`;
  }
  return null;
}
