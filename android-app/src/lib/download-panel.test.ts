/*
 * YT Convert for Android — GPLv3 companion app.
 * Copyright (C) 2026 rahmanjimmy504-code
 * Licensed under the GNU General Public License v3 or later.
 */

import { describe, expect, it } from 'vitest';
import { deriveDownloadPanelState, qualityDowngradeNote } from './download-panel';

describe('deriveDownloadPanelState', () => {
  it('is ready for a convertible platform when the extractor works', () => {
    expect(deriveDownloadPanelState('youtube', true)).toEqual({ kind: 'ready' });
  });

  it('stays visible but disabled while the native extractor is a stub', () => {
    expect(deriveDownloadPanelState('youtube', false)).toEqual({ kind: 'no-extractor' });
  });

  it('explains DRM platforms instead of offering a button', () => {
    const state = deriveDownloadPanelState('spotify', true);
    expect(state.kind).toBe('unavailable');
    if (state.kind === 'unavailable') expect(state.reason).toMatch(/DRM/i);
  });

  it('treats an unknown platform as not extractable', () => {
    expect(deriveDownloadPanelState(null, true)).toEqual({ kind: 'no-extractor' });
  });
});

describe('qualityDowngradeNote', () => {
  it('says nothing when the requested quality is met', () => {
    expect(qualityDowngradeNote({ quality: '720', kind: 'progressive', height: 720 }, '720')).toBeNull();
  });

  it('warns that muxing is not implemented yet', () => {
    const note = qualityDowngradeNote({ quality: '1080', kind: 'mux', height: 360 }, '1080');
    expect(note).toMatch(/1080p/);
    expect(note).toMatch(/360p/);
  });

  it('reports the best single file when the target is unreachable', () => {
    const note = qualityDowngradeNote({ quality: '1080', kind: 'progressive', height: 360 }, '1080');
    expect(note).toMatch(/highest available stream is 360p/);
  });

  it('handles a missing plan', () => {
    expect(qualityDowngradeNote(undefined, '720')).toBeNull();
  });
});
