import { describe, expect, it } from 'vitest';
import { deriveDownloadPanelState } from './download-panel';

describe('deriveDownloadPanelState', () => {
  it('returns ready for a convertible platform with a ticket', () => {
    expect(deriveDownloadPanelState('youtube', true)).toEqual({ kind: 'ready' });
    expect(deriveDownloadPanelState('soundcloud', true)).toEqual({ kind: 'ready' });
  });

  it('returns no-ticket for a convertible platform without a ticket', () => {
    // A 5xx / "Could not load info" fallback drops the ticket; the panel must
    // stay visible in an honest disabled state instead of disappearing.
    expect(deriveDownloadPanelState('youtube', false)).toEqual({ kind: 'no-ticket' });
    expect(deriveDownloadPanelState('tiktok', false)).toEqual({ kind: 'no-ticket' });
  });

  it('returns unavailable with a reason for DRM platforms', () => {
    const spotify = deriveDownloadPanelState('spotify', true);
    expect(spotify.kind).toBe('unavailable');
    if (spotify.kind === 'unavailable') {
      expect(spotify.reason).toMatch(/DRM/i);
      expect(spotify.reason.length).toBeGreaterThan(10);
    }

    // Ticket presence never makes a DRM platform downloadable here.
    expect(deriveDownloadPanelState('applemusic', true).kind).toBe('unavailable');
    expect(deriveDownloadPanelState('applemusic', false).kind).toBe('unavailable');
  });

  it('returns no-ticket for a missing/unknown platform', () => {
    expect(deriveDownloadPanelState('', true)).toEqual({ kind: 'no-ticket' });
    expect(deriveDownloadPanelState(undefined, true)).toEqual({ kind: 'no-ticket' });
    expect(deriveDownloadPanelState(null, false)).toEqual({ kind: 'no-ticket' });
  });
});
