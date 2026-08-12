// Pure UI logic for the first-party "Download here" panel shown on the ready
// result card. Kept separate from the component so the visibility/state rules
// can be unit-tested without rendering React.

import {
  canConvertPlatform,
  convertUnavailableReason,
  type PlatformKey,
} from './platforms';

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
