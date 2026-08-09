import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  analyticsEnabled,
  getReportCounts,
  getStatsSnapshot,
  recordEvent,
  recordReport,
  resetStatsForTests,
} from './stats';

beforeEach(() => {
  vi.unstubAllEnvs();
  resetStatsForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetStatsForTests();
});

describe('recordEvent / getStatsSnapshot', () => {
  it('tracks per-platform lookup success and failure', () => {
    recordEvent({ type: 'lookup', platform: 'youtube', ok: true });
    recordEvent({ type: 'lookup', platform: 'youtube', ok: true });
    recordEvent({ type: 'lookup', platform: 'youtube', ok: false, error: 'fetch failed' });
    recordEvent({ type: 'lookup', platform: 'tiktok', ok: false, error: 'captcha rejected' });

    const snapshot = getStatsSnapshot();
    expect(snapshot.lookups.youtube).toEqual({ ok: 2, fail: 1 });
    expect(snapshot.lookups.tiktok).toEqual({ ok: 0, fail: 1 });
    expect(snapshot.totals.lookup).toBe(4);
  });

  it('tracks converter clicks', () => {
    recordEvent({ type: 'converter_click', converter: '9Convert', platform: 'youtube' });
    recordEvent({ type: 'converter_click', converter: '9Convert', platform: 'youtube' });
    expect(getStatsSnapshot().clicks).toEqual({ '9Convert': 2 });
  });

  it('buckets error messages with digits redacted', () => {
    recordEvent({ type: 'lookup', platform: 'youtube', ok: false, error: 'HTTP 404 from https://example.com/123' });
    recordEvent({ type: 'lookup', platform: 'youtube', ok: false, error: 'HTTP 404 from https://example.com/456' });
    recordEvent({ type: 'lookup', platform: 'youtube', ok: false, error: 'HTTP 500 from https://example.com/789' });

    const snapshot = getStatsSnapshot();
    const bucket = snapshot.errors.find(e => e.message.includes('HTTP #'));
    expect(bucket?.count).toBe(3);
    expect(snapshot.errors.reduce((sum, e) => sum + e.count, 0)).toBe(3);
  });

  it('sorts error buckets by count descending', () => {
    recordEvent({ type: 'client_error', error: 'rare error' });
    for (let i = 0; i < 5; i += 1) recordEvent({ type: 'client_error', error: 'common error' });

    const errors = getStatsSnapshot().errors;
    expect(errors[0].message).toBe('common error');
    expect(errors[0].count).toBe(5);
  });

  it('keeps the error map bounded', () => {
    for (let i = 0; i < 50; i += 1) {
      recordEvent({ type: 'client_error', error: `unique error ${i}` });
    }
    expect(getStatsSnapshot().errors.length).toBeLessThanOrEqual(20);
  });
});

describe('recordReport', () => {
  it('stores reports and counts them per converter', () => {
    recordReport({ converter: 'Y2Mate', issue: 'dead' });
    recordReport({ converter: 'Y2Mate', issue: 'unsafe', note: 'fake download button' });
    recordReport({ converter: 'SSSTik', issue: 'wrong' });

    expect(getReportCounts()).toEqual({ Y2Mate: 2, SSSTik: 1 });
    const snapshot = getStatsSnapshot();
    expect(snapshot.totals.report).toBe(3);
    expect(snapshot.reports[0]).toMatchObject({ converter: 'SSSTik', issue: 'wrong' });
  });

  it('caps the number of kept reports', () => {
    for (let i = 0; i < 250; i += 1) {
      recordReport({ converter: '9Convert', issue: 'other', note: `note ${i}` });
    }
    expect(getStatsSnapshot().reports.length).toBe(200);
  });
});

describe('analyticsEnabled', () => {
  it('is enabled by default', () => {
    delete process.env.DISABLE_ANALYTICS;
    expect(analyticsEnabled()).toBe(true);
  });

  it('can be disabled with DISABLE_ANALYTICS=1', () => {
    vi.stubEnv('DISABLE_ANALYTICS', '1');
    expect(analyticsEnabled()).toBe(false);
    recordEvent({ type: 'lookup', platform: 'youtube', ok: true });
    expect(getStatsSnapshot().totals.lookup).toBeUndefined();
  });
});
