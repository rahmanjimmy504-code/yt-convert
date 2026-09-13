'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Clipboard, Download, ExternalLink, Trash2, Upload } from 'lucide-react';
import { detectPlatform, platformColor, platformLabel, type PlatformKey } from '@/lib/platforms';

type BatchItem = {
  url: string;
  platform: PlatformKey | null;
};

const STORAGE_KEY = 'yt-convert-batch-links';
const MAX_LINKS = 50;

function parseLinks(value: string): string[] {
  const seen = new Set<string>();
  const links: string[] = [];
  for (const raw of value.split(/[\s,]+/)) {
    const candidate = raw.trim().replace(/[),.;]+$/, '');
    if (!candidate) continue;
    const url = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
    try {
      const parsed = new URL(url);
      if (!/^https?:$/.test(parsed.protocol)) continue;
      const normalized = parsed.href;
      if (!seen.has(normalized)) {
        seen.add(normalized);
        links.push(normalized);
      }
    } catch {
      // Ignore text that is not a URL.
    }
    if (links.length >= MAX_LINKS) break;
  }
  return links;
}

function downloadText(filename: string, content: string, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 0);
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export default function ToolsPage() {
  const [text, setText] = useState('');
  const [items, setItems] = useState<BatchItem[]>([]);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as string[];
      if (Array.isArray(saved)) {
        setItems(saved.slice(0, MAX_LINKS).map(url => ({ url, platform: detectPlatform(url) })));
      }
    } catch {}
  }, []);

  const persist = (next: BatchItem[]) => {
    setItems(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next.map(item => item.url)));
  };

  const addLinks = () => {
    const incoming = parseLinks(text);
    const merged = [...items.map(item => item.url), ...incoming];
    const unique = [...new Set(merged)].slice(0, MAX_LINKS);
    persist(unique.map(url => ({ url, platform: detectPlatform(url) })));
    setText('');
  };

  const removeLink = (url: string) => persist(items.filter(item => item.url !== url));

  const clearAll = () => {
    setItems([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const supportedCount = useMemo(() => items.filter(item => item.platform).length, [items]);
  const visibleItems = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return items;
    return items.filter(item => item.url.toLowerCase().includes(query) || (item.platform && platformLabel(item.platform).toLowerCase().includes(query)));
  }, [filter, items]);

  const copyList = async () => {
    if (!items.length) return;
    try {
      await navigator.clipboard.writeText(items.map(item => item.url).join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  const exportJson = () => {
    if (!items.length) return;
    downloadText('yt-convert-links.json', JSON.stringify({ exportedAt: new Date().toISOString(), links: items }, null, 2), 'application/json;charset=utf-8');
  };

  const exportCsv = () => {
    if (!items.length) return;
    const rows = ['platform,url', ...items.map(item => `${csvCell(item.platform ? platformLabel(item.platform) : 'Unknown')},${csvCell(item.url)}`)];
    downloadText('yt-convert-links.csv', rows.join('\n'), 'text/csv;charset=utf-8');
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900 text-gray-900 dark:text-white px-4 py-8">
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-red-500">
            <ArrowLeft className="w-4 h-4" /> Back to YT Convert
          </Link>
          <span className="text-[10px] font-bold tracking-wide px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">100% LOCAL</span>
        </div>

        <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 space-y-4 shadow-sm">
          <div>
            <h1 className="text-xl font-bold">Batch link checker</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Paste several links at once. Detection, filtering, and exports happen entirely in your browser — no API, database, account, or paid service is used.
            </p>
          </div>

          <textarea
            value={text}
            onChange={event => setText(event.target.value)}
            onKeyDown={event => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') addLinks();
            }}
            rows={7}
            spellCheck={false}
            placeholder={'Paste one or many links…\nhttps://youtu.be/example\nhttps://soundcloud.com/example'}
            className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500 resize-y"
          />

          <div className="flex flex-wrap gap-2">
            <button onClick={addLinks} disabled={!text.trim()} className="h-10 px-4 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-sm font-semibold inline-flex items-center gap-2">
              <Upload className="w-4 h-4" /> Add links
            </button>
            <button onClick={copyList} disabled={!items.length} className="h-10 px-4 rounded-xl bg-gray-100 dark:bg-gray-800 disabled:opacity-40 text-sm font-semibold inline-flex items-center gap-2">
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Clipboard className="w-4 h-4" />}
              {copied ? 'Copied' : 'Copy list'}
            </button>
            <button onClick={exportJson} disabled={!items.length} className="h-10 px-4 rounded-xl bg-gray-100 dark:bg-gray-800 disabled:opacity-40 text-sm font-semibold inline-flex items-center gap-2">
              <Download className="w-4 h-4" /> JSON
            </button>
            <button onClick={exportCsv} disabled={!items.length} className="h-10 px-4 rounded-xl bg-gray-100 dark:bg-gray-800 disabled:opacity-40 text-sm font-semibold inline-flex items-center gap-2">
              <Download className="w-4 h-4" /> CSV
            </button>
            <button onClick={clearAll} disabled={!items.length} className="h-10 px-4 rounded-xl bg-gray-100 dark:bg-gray-800 disabled:opacity-40 text-sm font-semibold inline-flex items-center gap-2">
              <Trash2 className="w-4 h-4" /> Clear
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={filter}
              onChange={event => setFilter(event.target.value)}
              placeholder="Filter links or platforms…"
              className="h-9 flex-1 min-w-48 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <p className="text-[11px] text-gray-400">{visibleItems.length}/{items.length} shown · {supportedCount} detected · max {MAX_LINKS}</p>
          </div>
        </section>

        {items.length > 0 && (
          <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">Your links <span className="text-xs text-gray-400">({items.length})</span></h2>
              <span className="text-[10px] text-gray-400">Saved only on this device</span>
            </div>
            <div className="space-y-2">
              {visibleItems.map(item => (
                <div key={item.url} className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                  <span className={'shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full ' + (item.platform ? platformColor(item.platform) : 'bg-gray-100 text-gray-500 dark:bg-gray-800')}>
                    {item.platform ? platformLabel(item.platform) : 'Unknown'}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-gray-600 dark:text-gray-300" title={item.url}>{item.url}</span>
                  <button onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')} className="shrink-0 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Open link" title="Open link">
                    <ExternalLink className="w-4 h-4" />
                  </button>
                  <button onClick={() => removeLink(item.url)} className="shrink-0 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-gray-400 hover:text-red-500" aria-label="Remove link" title="Remove link">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {!visibleItems.length && <p className="py-6 text-center text-sm text-gray-400">No links match your filter.</p>}
            </div>
          </section>
        )}

        <section className="text-center text-xs text-gray-400 space-y-1">
          <p>Tip: use Ctrl+Enter (or Cmd+Enter) to add the pasted links.</p>
          <p>Exports contain only the links already stored in this browser. This tool does not download media or bypass DRM/private content.</p>
        </section>
      </div>
    </main>
  );
}
