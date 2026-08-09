'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Flag,
  Lock,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import type { ConverterStatus } from '@/lib/converters';
import { platformLabel } from '@/lib/platforms';

interface StatsSnapshot {
  enabled: boolean;
  startedAt: number;
  uptimeSeconds: number;
  totals: Record<string, number>;
  lookups: Record<string, { ok: number; fail: number }>;
  errors: Array<{ message: string; count: number }>;
  clicks: Record<string, number>;
  reports: Array<{ converter: string; issue: string; note?: string; at: number }>;
}

interface ConverterCheckResult {
  name: string;
  url: string;
  status: ConverterStatus;
  checkedAt: number;
  statusCode?: number;
  latencyMs?: number;
  error?: string;
  reports: number;
}

interface StatusPayload {
  siteUrl: string;
  stats: StatsSnapshot;
  converters: { results: ConverterCheckResult[]; checkedAt: number; stale: boolean };
}

const TOKEN_KEY = 'yt-convert-admin-token';

const ISSUE_LABELS: Record<string, string> = {
  dead: 'Dead link',
  unsafe: 'Unsafe site',
  wrong: 'Does not work',
  other: 'Other',
};

function fmtRelative(ts: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return new Date(ts).toLocaleString();
}

function fmtUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">{title}</h3>
      {children}
    </section>
  );
}

export default function StatusPage() {
  const [token, setToken] = useState('');
  const [inputToken, setInputToken] = useState('');
  const [authError, setAuthError] = useState('');
  const [data, setData] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Restore the token for the session (sessionStorage only — never persisted).
  useEffect(() => {
    document.title = 'Status | YT Convert';
    try {
      const stored = sessionStorage.getItem(TOKEN_KEY);
      if (stored) setToken(stored);
    } catch {
      // storage unavailable — user just re-enters the token
    }
  }, []);

  const load = useCallback(async (authToken: string) => {
    setLoading(true);
    setAuthError('');
    try {
      const response = await fetch('/api/status', {
        headers: { Authorization: `Bearer ${authToken}` },
        cache: 'no-store',
      });
      if (response.status === 401) {
        setAuthError('Wrong token. Try again.');
        setToken('');
        try {
          sessionStorage.removeItem(TOKEN_KEY);
        } catch {}
        return;
      }
      if (!response.ok) {
        setAuthError(`Status API returned ${response.status}. Is ADMIN_TOKEN set?`);
        return;
      }
      const payload = (await response.json()) as StatusPayload;
      setData(payload);
      setToken(authToken);
      try {
        sessionStorage.setItem(TOKEN_KEY, authToken);
      } catch {}
    } catch {
      setAuthError('Could not reach the status API.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) void load(token);
  }, [token, load, refreshKey]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = inputToken.trim();
    if (!value) return;
    setLoginLoading(true);
    await load(value);
    setLoginLoading(false);
  };

  const logout = () => {
    setToken('');
    setData(null);
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {}
  };

  const lookups = data?.stats.lookups || {};
  const platformRows = Object.entries(lookups).map(([platform, counts]) => {
    const total = counts.ok + counts.fail;
    const failRate = total > 0 ? Math.round((counts.fail / total) * 100) : 0;
    return { platform, ...counts, total, failRate };
  });
  const failingPlatforms = platformRows.filter(row => row.fail > 0).sort((a, b) => b.failRate - a.failRate);

  const lookupTotals = platformRows.reduce((acc, row) => ({ ok: acc.ok + row.ok, fail: acc.fail + row.fail }), { ok: 0, fail: 0 });
  const successRate = lookupTotals.ok + lookupTotals.fail > 0 ? Math.round((lookupTotals.ok / (lookupTotals.ok + lookupTotals.fail)) * 100) : 100;

  const reportCounts = (data?.converters.results || []).reduce<Record<string, number>>((acc, result) => {
    if (result.reports > 0) acc[result.name] = result.reports;
    return acc;
  }, {});

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900 text-gray-900 dark:text-white">
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-red-500 to-red-600 shadow-lg shadow-red-500/20">
              <Activity className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight">YT Convert Status</h1>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Admin dashboard {'\u2014'} analytics, errors, converter health</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data && (
              <button onClick={() => setRefreshKey(k => k + 1)} className="h-9 px-3 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center gap-1.5 text-xs font-semibold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                <RefreshCw className={'w-3.5 h-3.5' + (loading ? ' animate-spin' : '')} /> Refresh
              </button>
            )}
            <Link href="/" className="h-9 px-3 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center gap-1.5 text-xs font-semibold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" /> Site
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6 space-y-5">
        {!data ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 max-w-sm mx-auto mt-10 space-y-4">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-red-500" />
              <h2 className="font-semibold text-sm">Admin sign-in</h2>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              Enter the ADMIN_TOKEN set on the server. The token is kept in session storage for this tab only.
            </p>
            <form onSubmit={handleLogin} className="space-y-3">
              <input
                type="password"
                value={inputToken}
                onChange={e => setInputToken(e.target.value)}
                placeholder="ADMIN_TOKEN"
                autoComplete="off"
                className="w-full h-11 px-3 text-sm rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
              {authError && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{authError}</p>}
              <button type="submit" disabled={loginLoading || !inputToken.trim()} className="w-full h-11 rounded-xl bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-sm font-semibold shadow-lg shadow-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                {loginLoading ? 'Checking…' : 'Sign in'}
              </button>
            </form>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-gray-500 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-green-500" /> Signed in {'\u00B7'} {data.siteUrl}
              </p>
              <button onClick={logout} className="text-xs text-gray-400 hover:text-red-500 transition-colors">Sign out</button>
            </div>

            {!data.stats.enabled && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                Analytics are disabled (DISABLE_ANALYTICS=1). The counters below are empty.
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Lookups', value: String(lookupTotals.ok + lookupTotals.fail), sub: `success rate ${successRate}%` },
                { label: 'Failures', value: String(lookupTotals.fail), sub: 'platform lookups' },
                { label: 'Client errors', value: String(data.stats.errors.reduce((sum, e) => sum + e.count, 0)), sub: 'bucketed messages' },
                { label: 'Reports', value: String(data.stats.totals.report || 0), sub: 'from users' },
              ].map(stat => (
                <div key={stat.label} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
                  <p className="text-[11px] text-gray-400 font-medium">{stat.label}</p>
                  <p className="text-2xl font-bold mt-1">{stat.value}</p>
                  <p className="text-[11px] text-gray-500 mt-1">{stat.sub}</p>
                </div>
              ))}
            </div>

            <div className="text-[11px] text-gray-400 text-right">
              Instance up {fmtUptime(data.stats.uptimeSeconds)} {'\u00B7'} counters reset on redeploy
            </div>

            <Card title="Platform health — which platforms fail">
              {platformRows.length === 0 ? (
                <p className="text-xs text-gray-500">No lookups recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {platformRows
                    .slice()
                    .sort((a, b) => b.failRate - a.failRate)
                    .map(row => (
                      <div key={row.platform} className="flex items-center gap-3 text-xs">
                        <span className="w-28 flex-shrink-0 font-medium truncate">{platformLabel(row.platform) || row.platform}</span>
                        <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                          <div
                            className={'h-full rounded-full ' + (row.failRate === 0 ? 'bg-green-500' : row.failRate > 20 ? 'bg-red-500' : 'bg-amber-400')}
                            style={{ width: `${Math.max(row.failRate, 2)}%` }}
                          />
                        </div>
                        <span className="w-24 text-right text-gray-500 flex-shrink-0">
                          {row.ok} ok / {row.fail} fail
                        </span>
                        <span className={'w-12 text-right font-semibold flex-shrink-0 ' + (row.failRate === 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
                          {row.failRate}%
                        </span>
                      </div>
                    ))}
                </div>
              )}
              {failingPlatforms.length > 0 && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  Highest failure rate: {platformLabel(failingPlatforms[0].platform)} ({failingPlatforms[0].failRate}%)
                </p>
              )}
            </Card>

            <Card title="Recent errors">
              {data.stats.errors.length === 0 ? (
                <p className="text-xs text-gray-500">No errors recorded.</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.stats.errors.slice(0, 10).map(error => (
                    <li key={error.message} className="flex items-start justify-between gap-3 text-xs">
                      <code className="text-gray-600 dark:text-gray-300 flex-1 break-all">{error.message}</code>
                      <span className="text-gray-400 flex-shrink-0">{error.count}×</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Converter availability">
              <div className="flex items-center gap-2 text-[11px] text-gray-500">
                <span>Last checked {fmtRelative(data.converters.checkedAt)}</span>
                {data.converters.stale && <span className="text-amber-600 dark:text-amber-400">(stale — refresh to re-probe)</span>}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {data.converters.results.map(result => (
                  <div key={result.name} className="flex items-center gap-2.5 rounded-lg border border-gray-200 dark:border-gray-800 p-2.5 text-xs">
                    {result.status === 'working' ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{result.name}</p>
                      <p className="text-[10px] text-gray-500 truncate">{result.url}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={'font-semibold ' + (result.status === 'working' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
                        {result.status}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {result.statusCode ?? '—'} {'\u00B7'} {result.latencyMs != null ? `${result.latencyMs}ms` : '—'}
                        {result.error ? ` · ${result.error}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Converter reports from users">
              {data.stats.reports.length === 0 ? (
                <p className="text-xs text-gray-500">No reports yet. Users flag dead or unsafe converters with the flag button on each card.</p>
              ) : (
                <ul className="space-y-2">
                  {data.stats.reports.slice(0, 20).map((report, index) => (
                    <li key={index} className="flex items-start gap-2.5 text-xs">
                      <Flag className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {report.converter} <span className="font-normal text-gray-500">— {ISSUE_LABELS[report.issue] || report.issue}</span>
                        </p>
                        {report.note && <p className="text-gray-500 mt-0.5 break-words">{report.note}</p>}
                        <p className="text-[10px] text-gray-400 mt-0.5">{fmtRelative(report.at)}</p>
                      </div>
                      {reportCounts[report.converter] && (
                        <span className="ml-auto text-[10px] text-amber-600 dark:text-amber-400 flex-shrink-0 whitespace-nowrap">
                          {reportCounts[report.converter]} report{reportCounts[report.converter] > 1 ? 's' : ''}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Converter clicks">
              {Object.keys(data.stats.clicks).length === 0 ? (
                <p className="text-xs text-gray-500">No converter clicks recorded yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(data.stats.clicks)
                    .sort((a, b) => b[1] - a[1])
                    .map(([name, count]) => (
                      <span key={name} className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-gray-800 px-2.5 py-1 text-[11px] font-medium">
                        {name} <span className="text-gray-400">{count}×</span>
                      </span>
                    ))}
                </div>
              )}
            </Card>
          </>
        )}
      </main>

      <footer className="border-t border-gray-200 dark:border-gray-800 py-3 mt-auto">
        <p className="text-center text-[11px] text-gray-400">YT Convert — admin status · not linked from the public site</p>
      </footer>
    </div>
  );
}
