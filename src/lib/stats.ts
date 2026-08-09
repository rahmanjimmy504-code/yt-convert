/**
 * Privacy-friendly analytics and error monitoring.
 *
 * Design rules:
 *  - No cookies, no fingerprinting, no cross-site tracking.
 *  - No IP addresses, user agents, or full URLs are ever stored — only
 *    aggregate counters keyed by platform/converter/error bucket.
 *  - Everything lives in process memory (like the other stores in this
 *    project) and resets on redeploy; the dashboard is a soft operational
 *    view, not a persistent data warehouse.
 *  - Set DISABLE_ANALYTICS=1 to turn the counters off completely.
 *
 * The main signal the site owner needs is "which platforms fail": every
 * metadata lookup is recorded with its platform and success/failure, and
 * failures are bucketed (numbers redacted) so repeated error messages don't
 * flood the dashboard.
 */

export type ReportIssue = 'dead' | 'unsafe' | 'wrong' | 'other';

export interface ReportEntry {
  converter: string;
  issue: ReportIssue;
  /** Free-text note supplied by the reporter (optional, length-capped). */
  note?: string;
  at: number;
}

export type AnalyticsEvent =
  | { type: 'lookup'; platform: string; ok: boolean; error?: string }
  | { type: 'converter_click'; converter: string; platform: string }
  | { type: 'client_error'; error: string };

interface LookupCounts {
  ok: number;
  fail: number;
}

interface StatsState {
  totals: Record<string, number>;
  lookups: Record<string, LookupCounts>;
  errors: Record<string, number>;
  clicks: Record<string, number>;
  reports: ReportEntry[];
  startedAt: number;
}

const MAX_REPORTS_KEPT = 200;
const MAX_ERROR_BUCKETS = 20;
const MAX_ERROR_LENGTH = 90;

let state: StatsState = {
  totals: {},
  lookups: {},
  errors: {},
  clicks: {},
  reports: [],
  startedAt: Date.now(),
};

export function analyticsEnabled(): boolean {
  const flag = process.env.DISABLE_ANALYTICS;
  return flag !== '1' && flag !== 'true';
}

/** Collapse digits and cap length so error messages stay bucketed and small. */
function bucketError(message: string): string {
  const normalized = message.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
  return (normalized || 'unknown error').slice(0, MAX_ERROR_LENGTH);
}

function recordError(message: string): void {
  const key = bucketError(message);
  state.errors[key] = (state.errors[key] || 0) + 1;
  // Keep the map bounded: evict the lowest-count bucket when over the cap so
  // one-off noise can't push out recurring failures.
  if (Object.keys(state.errors).length > MAX_ERROR_BUCKETS) {
    let minKey: string | null = null;
    let minCount = Infinity;
    for (const [key2, count] of Object.entries(state.errors)) {
      if (count < minCount) {
        minCount = count;
        minKey = key2;
      }
    }
    if (minKey) delete state.errors[minKey];
  }
}

export function recordEvent(event: AnalyticsEvent): void {
  if (!analyticsEnabled()) return;

  state.totals[event.type] = (state.totals[event.type] || 0) + 1;

  switch (event.type) {
    case 'lookup': {
      const counts = (state.lookups[event.platform] ||= { ok: 0, fail: 0 });
      if (event.ok) counts.ok += 1;
      else {
        counts.fail += 1;
        if (event.error) recordError(event.error);
      }
      break;
    }
    case 'converter_click':
      state.clicks[event.converter] = (state.clicks[event.converter] || 0) + 1;
      break;
    case 'client_error':
      recordError(event.error);
      break;
  }
}

/** Record a user report about a broken/unsafe converter (also counts in totals). */
export function recordReport(entry: Omit<ReportEntry, 'at'>): void {
  if (!analyticsEnabled()) return;
  state.totals.report = (state.totals.report || 0) + 1;
  state.reports.push({ ...entry, at: Date.now() });
  if (state.reports.length > MAX_REPORTS_KEPT) {
    state.reports.splice(0, state.reports.length - MAX_REPORTS_KEPT);
  }
}

export function getReportCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const report of state.reports) {
    counts[report.converter] = (counts[report.converter] || 0) + 1;
  }
  return counts;
}

export interface StatsSnapshot {
  enabled: boolean;
  startedAt: number;
  uptimeSeconds: number;
  totals: Record<string, number>;
  lookups: Record<string, LookupCounts>;
  errors: Array<{ message: string; count: number }>;
  clicks: Record<string, number>;
  reports: ReportEntry[];
}

export function getStatsSnapshot(): StatsSnapshot {
  const errors = Object.entries(state.errors)
    .map(([message, count]) => ({ message, count }))
    .sort((a, b) => b.count - a.count);
  return {
    enabled: analyticsEnabled(),
    startedAt: state.startedAt,
    uptimeSeconds: Math.floor((Date.now() - state.startedAt) / 1000),
    totals: { ...state.totals },
    lookups: Object.fromEntries(Object.entries(state.lookups).map(([k, v]) => [k, { ...v }])),
    errors,
    clicks: { ...state.clicks },
    reports: [...state.reports].reverse(),
  };
}

/** Test-only: reset counters to a pristine state. */
export function resetStatsForTests(): void {
  state = { totals: {}, lookups: {}, errors: {}, clicks: {}, reports: [], startedAt: Date.now() };
}
