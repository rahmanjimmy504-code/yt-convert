import { describe, expect, it } from 'vitest';
import { deriveDownloadPanelState, qualityDowngradeNote } from './download-panel';

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

describe('qualityDowngradeNote', () => {
  it('returns null when no plan is known or the request is met', () => {
    expect(qualityDowngradeNote(undefined, '1080')).toBeNull();
    expect(qualityDowngradeNote({ quality: '720', kind: 'progressive', height: 720 }, '720')).toBeNull();
    // 'best' is met when the progressive stream is the best available.
    expect(qualityDowngradeNote({ quality: 'best', kind: 'progressive', height: 720 }, 'best')).toBeNull();
  });

  it('explains that a mux is needed instead of silently downgrading', () => {
    const note = qualityDowngradeNote({ quality: '1080', kind: 'mux', height: 360 }, '1080');
    expect(note).toMatch(/1080p/);
    expect(note).toMatch(/combining separate video \+ audio tracks/);
    expect(note).toMatch(/not available yet/);
    expect(note).toMatch(/360p/);
  });

  it('explains "best" when the adaptive ladder beats the progressive ceiling', () => {
    const note = qualityDowngradeNote({ quality: 'best', kind: 'mux', height: 360 }, 'best');
    expect(note).toMatch(/Best quality/);
    expect(note).toMatch(/360p/);
  });

  it('stays honest when no single-file stream exists to fall back to', () => {
    const note = qualityDowngradeNote({ quality: '1080', kind: 'mux', height: undefined }, '1080');
    expect(note).toMatch(/needs combining/);
    expect(note).not.toMatch(/closest single-file stream \(\d+p\)/);
  });

  it('reports a plan that cannot be satisfied at all', () => {
    expect(qualityDowngradeNote({ quality: '1080', kind: 'none' }, '1080')).toMatch(/not available/);
    expect(qualityDowngradeNote({ quality: 'best', kind: 'none' }, 'best')).toMatch(/Best quality/);
  });

  it('names the highest available stream when the fallback still misses the target', () => {
    const note = qualityDowngradeNote({ quality: '1080', kind: 'progressive', height: 720 }, '1080');
    expect(note).toMatch(/1080p is not available as a single file/);
    expect(note).toMatch(/720p/);
  });
});
