'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Clipboard, ExternalLink, Trash2, Upload } from 'lucide-react';
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

export default function ToolsPage() {
  const [text, setText] = useState('');
  const [items, setItems] = useState<BatchItem[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as string[];
      if (Array.isArray(saved)) {
        setItems(saved.slice(0, MAX_LINKS).map(url => ({ url, platform: detectPlatform(url) })));
      }
    } catch {}
  }, []);

  const addLinks = () => {
    const incoming = parseLinks(text);
    const merged = [...items.map(item => item.url), ...incoming];
    const unique = [...new Set(merged)].slice(0, MAX_LINKS);
    const next = unique.map(url => ({ url, platform: detectPlatform(url) }));
    setItems(next);
    setText('');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(unique));
  };

  const removeLink = (url: string) => {
    const next = items.filter(item => item.url !== url);
    setItems(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next.map(item => item.url)));
  };

  const clearAll = () => {
    setItems([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const supportedCount = useMemo(() => items.filter(item => item.platform).length, [items]);

  const copyList = async () => {
    if (!items.length) return;
    try {
      await navigator.clipboard.writeText(items.map(item => item.url).join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {}
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
              Paste several links at once. Detection happens entirely in your browser — no API, database, account, or paid service is used.
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
            <button onClick={clearAll} disabled={!items.length} className="h-10 px-4 rounded-xl bg-gray-100 dark:bg-gray-800 disabled:opacity-40 text-sm font-semibold inline-flex items-center gap-2">
              <Trash2 className="w-4 h-4" /> Clear
            </button>
          </div>
          <p className="text-[11px] text-gray-400">Up to {MAX_LINKS} unique links · {supportedCount} detected by YT Convert</p>
        </section>

        {items.length > 0 && (
          <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">Your links <span className="text-xs text-gray-400">({items.length})</span></h2>
              <span className="text-[10px] text-gray-400">Saved only on this device</span>
            </div>
            <div className="space-y-2">
              {items.map(item => (
                <div key={item.url} className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                  <span className={'shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full ' + (item.platform ? platformColor(item.platform) : 'bg-gray-100 text-gray-500 dark:bg-gray-800')}>
                    {item.platform ? platformLabel(item.platform) : 'Unknown'}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-gray-600 dark:text-gray-300" title={item.url}>{item.url}</span>
                  <button onClick={() => window.open(item.url, '_blank', 'noopener')} className="shrink-0 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Open link" title="Open link">
                    <ExternalLink className="w-4 h-4" />
                  </button>
                  <button onClick={() => removeLink(item.url)} className="shrink-0 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-gray-400 hover:text-red-500" aria-label="Remove link" title="Remove link">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="text-center text-xs text-gray-400 space-y-1">
          <p>Tip: use Ctrl+Enter (or Cmd+Enter) to add the pasted links.</p>
          <p>This tool only checks the URL format and the platforms YT Convert already knows about. It does not bypass DRM or private content.</p>
        </section>
      </div>
    </main>
  );
}
