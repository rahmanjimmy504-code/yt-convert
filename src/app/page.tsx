'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import NextLink from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleX,
  Clipboard,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Film,
  Flag,
  Keyboard,
  Link as LinkIcon,
  Moon,
  Music,
  Play,
  RefreshCw,
  Share2,
  Star,
  Sun,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  detectPlatform,
  extractYouTubeId,
  platformColor,
  platformLabel,
  type FormatKey,
  type PlatformKey,
} from '@/lib/platforms';
import { ALL_CONVERTERS, type Converter, type ConverterCheckResult } from '@/lib/converters';
import { getEmbed } from '@/lib/embed';
import Captcha from '@/components/captcha';

type Phase = 'input' | 'loading' | 'ready' | 'error';

interface VideoInfo {
  title: string;
  author: string;
  thumbnail: string;
  duration: string;
  views: string;
  published: string;
  platform: string;
}

interface HistoryItem {
  title: string;
  url: string;
  platform: string;
  time: number;
}

function sGet(k: string) {
  return typeof window === 'undefined' ? '' : localStorage.getItem(k) || '';
}
function sSet(k: string, v: string) {
  if (typeof window !== 'undefined') localStorage.setItem(k, v);
}
function sGetJ<T>(k: string): T | null {
  try {
    return typeof window === 'undefined' ? null : (JSON.parse(localStorage.getItem(k) || 'null') as T);
  } catch {
    return null;
  }
}
function sSetJ(k: string, v: unknown) {
  if (typeof window !== 'undefined') localStorage.setItem(k, JSON.stringify(v));
}

const tips = ['Paste any link from YouTube, Spotify, SoundCloud, X, Instagram, Deezer, Apple Music, TikTok, Facebook, Snapchat or BeReal.', 'Your URL is auto-copied when you pick a converter.', 'If one converter has ads, try another.', 'All converters are free, no sign-up needed.', 'Press Enter after pasting to fetch info instantly.', 'Shortcuts: press / to jump to the link box, Esc to start over.', 'Drag and drop a link anywhere on the page to load it.', 'Click Preview to watch or listen before converting.', 'Press ? to see all keyboard shortcuts.'];
const placeholders = ['https://www.youtube.com/watch?v=...', 'https://open.spotify.com/track/...', 'https://soundcloud.com/...', 'https://x.com/user/status/...', 'https://www.instagram.com/reel/...', 'https://music.apple.com/...', 'https://www.deezer.com/track/...', 'https://music.youtube.com/watch?v=...', 'https://www.tiktok.com/...', 'https://www.facebook.com/...', 'https://www.snapchat.com/add/...', 'https://bereal.com/...'];

/** Copy text to the clipboard, reporting whether it actually worked. */
async function copyText(t: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    return false; // clipboard blocked by browser permissions
  }
}

/** Anonymous, cookieless event for the privacy-friendly analytics. */
function sendEvent(payload: Record<string, unknown>): void {
  try {
    void fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // analytics must never break the UI
  }
}

type ReportIssue = 'dead' | 'unsafe' | 'wrong' | 'other';

const REPORT_OPTIONS: Array<{ key: ReportIssue; label: string; hint: string }> = [
  { key: 'dead', label: 'Link is dead', hint: 'Site is down, 404, or redirected to spam.' },
  { key: 'unsafe', label: 'Looks unsafe', hint: 'Scam, malware, fake download buttons or abusive ads.' },
  { key: 'wrong', label: "Doesn't work", hint: 'Fails for this platform/format, or errors every time.' },
  { key: 'other', label: 'Something else', hint: 'Any other problem worth fixing.' },
];

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState<FormatKey>('mp4');
  const [phase, setPhase] = useState<Phase>('input');
  const [error, setError] = useState('');
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [launched, setLaunched] = useState<{ name: string; copied: boolean } | null>(null);
  const [tipIdx, setTipIdx] = useState(0);
  const [dark, setDark] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [favorite, setFavorite] = useState('');
  const [phIdx, setPhIdx] = useState(0);
  const [linkCopied, setLinkCopied] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [dragging, setDragging] = useState(false);
  // Converter availability ("working"/"unavailable") from /api/converters/status.
  const [converterStatus, setConverterStatus] = useState<Record<string, ConverterCheckResult>>({});
  const [statusCheckedAt, setStatusCheckedAt] = useState<number | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  // Broken/unsafe converter reporting dialog.
  const [reportFor, setReportFor] = useState<Converter | null>(null);
  const [reportIssue, setReportIssue] = useState<ReportIssue>('dead');
  const [reportNote, setReportNote] = useState('');
  const [reportSending, setReportSending] = useState(false);
  const [reportError, setReportError] = useState('');
  const [reportDone, setReportDone] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const convertersRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against stale metadata lookups: abort cancels the in-flight fetch,
  // reqId ensures a slow older response can never overwrite a newer one.
  const abortRef = useRef<AbortController | null>(null);
  const reqIdRef = useRef(0);
  // dragenter/dragleave fire for every child element crossed, so a depth
  // counter is needed to know when the pointer actually left the window.
  const dragDepth = useRef(0);

  useEffect(() => {
    setMounted(true);
    const s = sGet('yt-convert-dark');
    const d = s !== '' ? s === '1' : window.matchMedia('(prefers-color-scheme:dark)').matches;
    setDark(d);
    document.documentElement.classList.toggle('dark', d);
    setHistory(sGetJ<HistoryItem[]>('yt-convert-history') || []);
    setFavorite(sGet('yt-convert-fav'));
    const f = sGet('yt-convert-format');
    if (f === 'mp3' || f === 'mp4') setFormat(f);
    else if (f === 'audio') setFormat('mp3'); // migrate legacy value
    else if (f === 'video') setFormat('mp4'); // migrate legacy value
    return () => {
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      abortRef.current?.abort();
    };
  }, []);

  const toggleDark = useCallback(() => {
    setDark(prev => {
      const n = !prev;
      document.documentElement.classList.toggle('dark', n);
      sSet('yt-convert-dark', n ? '1' : '0');
      return n;
    });
  }, []);

  useEffect(() => { const i = setInterval(() => setTipIdx(t => (t + 1) % tips.length), 5000); return () => clearInterval(i); }, []);
  useEffect(() => { const i = setInterval(() => setPhIdx(p => (p + 1) % placeholders.length), 4000); return () => clearInterval(i); }, []);

  // Drag & drop: dropping a link anywhere on the page fills the input box.
  // The regular validation/auto-fetch flow takes over from there.
  useEffect(() => {
    const hasLink = (dt: DataTransfer | null) =>
      !!dt && Array.from(dt.types).some(t => t === 'text/uri-list' || t === 'text/plain');
    const onDragEnter = (e: DragEvent) => {
      if (!hasLink(e.dataTransfer)) return;
      e.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!hasLink(e.dataTransfer)) return;
      e.preventDefault();
    };
    const onDragLeave = (e: DragEvent) => {
      if (!hasLink(e.dataTransfer)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasLink(e.dataTransfer)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const text = (e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain') || '')
        .split(/\r?\n/)[0]
        ?.trim() || '';
      // Only accept things that look like a link (same guard detectPlatform
      // applies); everything else is ignored so file drops do nothing.
      if (!text || (!/^https?:\/\//i.test(text) && !/^\w+\.\w{2,}/i.test(text))) return;
      setUrl(text);
      setPhase('input');
      setError('');
      setVideoInfo(null);
      setLaunched(null);
      setPreviewOpen(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      inputRef.current?.focus();
    };
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  const dp = url.trim() ? detectPlatform(url.trim()) : null;

  const scrollToConverters = useCallback(() => {
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => convertersRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  }, []);

  // Availability probe: fetch once on mount and whenever "Check again" is
  // pressed. Server-side results are cached for 15 minutes, so this is cheap.
  const loadConverterStatus = useCallback(async () => {
    if (statusLoading) return;
    setStatusLoading(true);
    try {
      const response = await fetch('/api/converters/status', { cache: 'no-store' });
      if (!response.ok) return;
      const data = (await response.json()) as {
        results: ConverterCheckResult[];
        checkedAt: number;
      };
      const byName: Record<string, ConverterCheckResult> = {};
      for (const result of data.results) byName[result.name] = result;
      setConverterStatus(byName);
      setStatusCheckedAt(data.checkedAt);
    } catch {
      // Status is decorative; never block the page on it.
    } finally {
      setStatusLoading(false);
    }
  }, [statusLoading]);

  useEffect(() => {
    void loadConverterStatus();
  }, [loadConverterStatus]);

  // Privacy-friendly error monitoring: report uncaught client errors as
  // anonymous, bucketed events (no stack traces, no URLs, no identifiers).
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const message = (event.message || 'script error').slice(0, 200);
      sendEvent({ type: 'client_error', error: message });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        typeof reason === 'string' ? reason : reason instanceof Error ? reason.message : 'unhandled rejection';
      sendEvent({ type: 'client_error', error: (message || 'unhandled rejection').slice(0, 200) });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  const handleCaptchaVerified = useCallback((token: string) => {
    setCaptchaToken(token);
    if (token) setError('');
  }, []);

  const handleGetInfo = useCallback(async () => {
    const u = url.trim();
    if (!u) return;
    const plat = detectPlatform(u);
    if (!plat) { setError('Unsupported URL.'); setPhase('error'); return; }
    if (!captchaToken) {
      setError('Complete the CAPTCHA to continue.');
      setPhase('error');
      return;
    }
    setError(''); setPhase('loading'); setVideoInfo(null); setLaunched(null); setLinkCopied(false); setPreviewOpen(false);
    // Cancel the previous lookup (if any) so it can't clobber this one.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const reqId = ++reqIdRef.current;
    const stale = () => reqId !== reqIdRef.current;
    try {
      const r = await fetch('/api/video-info?url=' + encodeURIComponent(u), {
        signal: controller.signal,
        headers: { 'X-Captcha-Token': captchaToken },
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        const msg = (d as { error?: string }).error || 'Failed';
        // A proof token is single-use. If it expired or was consumed, ask for
        // a fresh CAPTCHA instead of leaving the user with a dead Go button.
        if (r.status === 403 && msg.toLowerCase().includes('captcha')) {
          if (!stale()) {
            setCaptchaToken('');
            setCaptchaResetKey(key => key + 1);
            setError(msg);
            setPhase('error');
          }
          return;
        }
        // Other 4xx responses mean the link itself was rejected — show that
        // message in the regular error state instead of the graceful card.
        if (r.status >= 400 && r.status < 500) {
          if (!stale()) { setError(msg); setPhase('error'); }
          return;
        }
        throw new Error(msg);
      }
      const data = (await r.json()) as Partial<VideoInfo>;
      if (stale()) return;
      const vid = extractYouTubeId(u);
      setVideoInfo({
        title: data.title || 'Unknown',
        author: data.author || '',
        thumbnail: data.thumbnail || (plat === 'youtube' && vid ? 'https://i.ytimg.com/vi/' + vid + '/hqdefault.jpg' : ''),
        duration: data.duration || '',
        views: data.views || '',
        published: data.published || '',
        platform: data.platform || plat,
      });
      setHistory(prev => {
        const h = [{ title: data.title || 'Unknown', url: u, platform: plat, time: Date.now() }, ...prev.filter((x: HistoryItem) => x.url !== u)].slice(0, 6);
        sSetJ('yt-convert-history', h);
        return h;
      });
      setPhase('ready');
      scrollToConverters();
    } catch (err) {
      if (stale() || (err instanceof Error && err.name === 'AbortError')) return;
      // Network/5xx failure: degrade gracefully so the converter list is
      // still reachable even though no metadata could be fetched.
      setVideoInfo({ title: 'Could not load info', author: '', thumbnail: '', duration: '', views: '', published: '', platform: plat });
      setPhase('ready');
      scrollToConverters();
    }
  }, [url, captchaToken, scrollToConverters]);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) { setUrl(text); setPhase('input'); setError(''); setVideoInfo(null); }
    } catch {}
  }, []);

  useEffect(() => {
    if (autoTimer.current) { clearTimeout(autoTimer.current); autoTimer.current = null; }
    if (captchaToken && (phase === 'input' || phase === 'error')) {
      const u = url.trim();
      if (detectPlatform(u) && u.length > 15 && /^https?:\/\//i.test(u)) {
        autoTimer.current = setTimeout(() => handleGetInfo(), 800);
      }
    }
    return () => { if (autoTimer.current) { clearTimeout(autoTimer.current); autoTimer.current = null; } };
  }, [url, phase, captchaToken, handleGetInfo]);

  const handleFormatChange = useCallback((f: FormatKey) => {
    setFormat(f);
    sSet('yt-convert-format', f);
  }, []);

  const videoId = videoInfo ? extractYouTubeId(url.trim()) : null;

  // Native player embed (YouTube, SoundCloud, Spotify, TikTok) backing the
  // Preview toggle; null for platforms without a public embed endpoint.
  const embed = videoInfo ? getEmbed(videoInfo.platform as PlatformKey, url.trim()) : null;

  const getConverters = useCallback(() => {
    const plat = videoInfo?.platform || (url.trim() ? detectPlatform(url.trim()) : null);
    if (!plat) return ALL_CONVERTERS.slice(0, 4);
    return ALL_CONVERTERS
      .filter(c => c.platforms.includes(plat as PlatformKey))
      .sort((a, b) => {
        if (a.name === favorite) return -1;
        if (b.name === favorite) return 1;
        // Prefer converters that support the selected format (MP3/MP4).
        const am = a.formats.includes(format) ? 1 : 0;
        const bm = b.formats.includes(format) ? 1 : 0;
        if (am !== bm) return bm - am;
        if (a.recommended && !b.recommended) return -1;
        if (b.recommended && !a.recommended) return 1;
        return 0;
      });
  }, [videoInfo, url, favorite, format]);

  const openConverter = async (c: Converter) => {
    const u = url.trim();
    // Wait for the clipboard write before opening the tab so the URL is ready
    // when the user lands on the converter site and presses Ctrl+V.
    const copied = await copyText(u);
    setLaunched({ name: c.name, copied });
    window.open(c.url, '_blank', 'noopener');
    // Anonymous analytics: which converter was picked for which platform.
    sendEvent({ type: 'converter_click', converter: c.name, platform: videoInfo?.platform || detectPlatform(u) || '' });
  };

  const submitReport = async () => {
    if (!reportFor || reportSending) return;
    setReportSending(true);
    setReportError('');
    try {
      const response = await fetch('/api/converters/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ converter: reportFor.name, issue: reportIssue, note: reportNote.trim() || undefined }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setReportError(data.error || 'Could not send the report. Please try again.');
        return;
      }
      setReportDone(true);
      // Reflect the report on the badge immediately without a full re-probe.
      setConverterStatus(prev => {
        const existing = prev[reportFor.name];
        if (!existing) return prev;
        return { ...prev, [reportFor.name]: { ...existing, reports: existing.reports + 1 } };
      });
    } catch {
      setReportError('Could not send the report. Please try again.');
    } finally {
      setReportSending(false);
    }
  };

  const closeReport = () => {
    setReportFor(null);
    setReportIssue('dead');
    setReportNote('');
    setReportError('');
    setReportDone(false);
  };
  const toggleFav = (n: string) => { const v = favorite === n ? '' : n; setFavorite(v); sSet('yt-convert-fav', v); };
  const clearHist = () => { setHistory([]); if (typeof window !== 'undefined') localStorage.removeItem('yt-convert-history'); };
  const handleReset = useCallback(() => {
    // Drop any in-flight lookup so its result can't reappear after the reset.
    abortRef.current?.abort();
    reqIdRef.current++;
    setUrl(''); setPhase('input'); setError(''); setVideoInfo(null); setLaunched(null); setLinkCopied(false); setPreviewOpen(false); setShowHelp(false);
    setCaptchaToken('');
    setCaptchaResetKey(key => key + 1);
    setFormat('mp4'); sSet('yt-convert-format', 'mp4');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);
  const copyLink = useCallback(async () => {
    const ok = await copyText(url.trim());
    setLinkCopied(ok);
    if (ok) {
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setLinkCopied(false), 2000);
    }
  }, [url]);
  // Share via the Web Share API where available (mobile browsers mostly);
  // otherwise fall back to copying the link like the Copy button does.
  const shareLink = useCallback(async () => {
    const u = url.trim();
    if (!u) return;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: videoInfo?.title || 'YT Convert', text: videoInfo?.title || u, url: u });
        return;
      } catch (err) {
        // The user dismissed the share sheet — nothing to do.
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    }
    await copyLink();
  }, [url, videoInfo, copyLink]);
  const clearUrl = useCallback(() => {
    setUrl(''); setPhase('input'); setError(''); setVideoInfo(null); setLaunched(null); setPreviewOpen(false);
    setCaptchaToken('');
    setCaptchaResetKey(key => key + 1);
    inputRef.current?.focus();
  }, []);
  const openOriginal = useCallback(() => {
    if (phase !== 'ready') return;
    window.open(videoId ? 'https://www.youtube.com/watch?v=' + videoId : url.trim(), '_blank', 'noopener');
  }, [phase, videoId, url]);

  // Global shortcuts: Esc closes the help panel or starts over (from the
  // ready/error states), / jumps to the link box and ? toggles the shortcut
  // list, matching common converter-site muscle memory.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showHelp) { setShowHelp(false); return; }
        if (phase === 'ready' || phase === 'error') handleReset();
      } else if (e.key === '?') {
        const t = e.target as HTMLElement | null;
        // Don't hijack '?' typed into the link box or any other field.
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
        setShowHelp(s => !s);
      } else if (e.key === '/' && phase === 'input' && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, handleReset, showHelp]);
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter' && (phase === 'input' || phase === 'error')) handleGetInfo(); };
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value);
    // Leave the error state as soon as the user starts editing the URL again.
    if (phase === 'error') { setPhase('input'); setError(''); }
  };

  const convList = getConverters();

  // Converter availability derived from the latest probe results.
  const statusMinutesAgo = statusCheckedAt ? Math.max(0, Math.round((Date.now() - statusCheckedAt) / 60000)) : null;
  const unavailableCount = convList.filter(c => converterStatus[c.name]?.status === 'unavailable').length;
  const statusSummary = statusCheckedAt
    ? `Checked ${statusMinutesAgo === 0 ? 'just now' : `${statusMinutesAgo} min ago`}`
    : null;

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900">
        <div className="w-8 h-8 border-[3px] border-red-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900 text-gray-900 dark:text-white">

      <header className="border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer select-none" onClick={handleReset}>
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-red-500 to-red-600 shadow-lg shadow-red-500/20">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8Z" fill="white"/><path d="m9.75 15.02 5.75-3.02-5.75-3.02v6.04Z" fill="#FF0000"/></svg>
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight">YT Convert</h1>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">YouTube {'\u00B7'} YT Music {'\u00B7'} SoundCloud {'\u00B7'} X {'\u00B7'} Instagram {'\u00B7'} Spotify {'\u00B7'} Deezer {'\u00B7'} Apple Music {'\u00B7'} TikTok {'\u00B7'} Facebook {'\u00B7'} Snapchat {'\u00B7'} BeReal</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NextLink href="/faq" className="h-9 px-3 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs font-semibold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
              FAQ
            </NextLink>
            <button onClick={() => setShowHelp(s => !s)} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
              <Keyboard size={18} />
            </button>
            <button onClick={toggleDark} aria-label="Toggle dark mode" className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" title="Toggle dark mode">
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 space-y-5">

        <div className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-800 transition-colors p-5 space-y-4">
          <label htmlFor="url-input" className="text-sm font-semibold">Paste any link</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input ref={inputRef} id="url-input" type="url" inputMode="url" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} placeholder={placeholders[phIdx]} value={url} onChange={handleUrlChange} onKeyDown={handleKeyDown} disabled={phase === 'loading'} className={'w-full pl-10 h-11 text-sm rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent placeholder:text-gray-400 dark:text-white ' + (url && (phase === 'input' || phase === 'error') ? 'pr-9' : 'pr-3')} />
              {url && (phase === 'input' || phase === 'error') && (
                <button type="button" onClick={clearUrl} aria-label="Clear link" title="Clear link" className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {(phase === 'input' || phase === 'error') && (
              <button onClick={handleGetInfo} disabled={!url.trim() || !captchaToken} aria-disabled={!url.trim() || !captchaToken} title={!captchaToken ? 'Complete the CAPTCHA first' : 'Fetch link information'} className="h-11 px-5 rounded-xl bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-sm font-semibold shadow-lg shadow-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2">
                Go <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {(phase === 'input' || phase === 'error') && (
              <button onClick={handlePaste} className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1 transition-colors">
                <Clipboard className="w-3.5 h-3.5" /> Paste from clipboard
              </button>
            )}
            {dp && phase === 'input' && <span className={'text-xs font-medium px-2.5 py-0.5 rounded-full ' + platformColor(dp)}>{platformLabel(dp)}</span>}
          </div>
          {(phase === 'input' || phase === 'error') && (
            <Captcha onVerified={handleCaptchaVerified} resetKey={captchaResetKey} />
          )}
          {phase === 'input' && (
            <div className="space-y-2">
              <label className="text-sm font-semibold">Format</label>
              <div className="grid grid-cols-2 h-11 rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
                <button onClick={() => handleFormatChange('mp3')} className={'rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ' + (format === 'mp3' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500')}>
                  <Music className="w-4 h-4" /> MP3
                </button>
                <button onClick={() => handleFormatChange('mp4')} className={'rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ' + (format === 'mp4' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500')}>
                  <Film className="w-4 h-4" /> MP4
                </button>
              </div>
            </div>
          )}
          {phase === 'input' && <p className="text-xs text-gray-400 text-center animate-pulse">{tips[tipIdx]}</p>}
        </div>

        {phase === 'loading' && (
          <div role="status" aria-live="polite" className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-red-200 dark:border-red-900 p-8 text-center space-y-3">
            <div className="w-8 h-8 border-[3px] border-red-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-gray-500">Fetching info...</p>
          </div>
        )}

        {phase === 'ready' && videoInfo && (
          <div>
            <div className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-red-200 dark:border-red-900 overflow-hidden p-5 space-y-4 mb-5">
              {videoInfo.thumbnail && (
                <div
                  className="relative rounded-xl overflow-hidden bg-black group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  role="button"
                  tabIndex={0}
                  aria-label={videoInfo.title && videoInfo.title !== 'Could not load info' ? `Open "${videoInfo.title}" on ${platformLabel(videoInfo.platform) || 'the source site'}` : 'Open the original link in a new tab'}
                  onClick={openOriginal}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openOriginal(); } }}
                >
                  <img src={videoInfo.thumbnail} alt={videoInfo.title} className="w-full object-cover" style={{ maxHeight: '360px' }} onError={(e) => { const img = e.currentTarget; // hqdefault.jpg can 404 for some videos (e.g. region-locked): fall back once to mqdefault, then give up instead of re-entering onError forever.
                    if (videoId && !img.src.endsWith('/mqdefault.jpg')) img.src = 'https://i.ytimg.com/vi/' + videoId + '/mqdefault.jpg'; else img.style.display = 'none'; }} />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-14 h-14 rounded-full bg-red-600 flex items-center justify-center"><Play className="w-6 h-6 text-white ml-0.5" fill="currentColor" /></div>
                  </div>
                  {videoInfo.duration && <span className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-0.5 rounded">{videoInfo.duration}</span>}
                </div>
              )}
              {previewOpen && embed && (
                <div className={
                  embed.kind === 'video'
                    ? 'aspect-video w-full rounded-xl overflow-hidden bg-black'
                    : embed.kind === 'tiktok'
                      ? 'max-w-[325px] mx-auto h-[560px] rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800'
                      : videoInfo.platform === 'spotify'
                        ? 'h-[152px] rounded-xl overflow-hidden'
                        : 'h-[300px] rounded-xl overflow-hidden'
                }>
                  <iframe
                    src={embed.url}
                    title={'Preview of ' + (videoInfo.title || 'the media')}
                    className="w-full h-full border-0"
                    loading="lazy"
                    allow="autoplay; encrypted-media; picture-in-picture; clipboard-write; web-share; fullscreen"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                </div>
              )}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-sm line-clamp-2">{videoInfo.title}</h3>
                  {videoInfo.author && <p className="text-xs text-gray-500 mt-1">{videoInfo.author}</p>}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {videoInfo.views && <span className="text-[11px] text-gray-400">{videoInfo.views} views</span>}
                    {videoInfo.published && <span className="text-[11px] text-gray-400">{videoInfo.published}</span>}
                    {embed && (
                      <button onClick={() => setPreviewOpen(p => !p)} className="text-[11px] font-medium text-red-600 dark:text-red-400 hover:opacity-75 transition-opacity flex items-center gap-1">
                        {previewOpen ? <><EyeOff className="w-3 h-3" /> Hide preview</> : <><Eye className="w-3 h-3" /> Preview</>}
                      </button>
                    )}
                  </div>
                </div>
                {videoInfo.platform && <span className={'text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ' + platformColor(videoInfo.platform)}>{platformLabel(videoInfo.platform)}</span>}
              </div>
            </div>

            <div ref={convertersRef} className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-gray-200 dark:border-gray-800 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-base">Converters</h2>
                  <span className="text-[11px] text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">{convList.length}</span>
                </div>
                <div className="flex items-center gap-3">
                  {linkCopied ? (
                    <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Link copied
                    </span>
                  ) : (
                    <button onClick={copyLink} className="text-xs text-gray-500 hover:text-red-500 flex items-center gap-1" title="Copy the link">
                      <Clipboard className="w-3 h-3" /> Copy link
                    </button>
                  )}
                  <button onClick={shareLink} className="text-xs text-gray-500 hover:text-red-500 flex items-center gap-1" title="Share this link">
                    <Share2 className="w-3 h-3" /> Share
                  </button>
                  <button onClick={handleReset} className="text-xs text-gray-500 hover:text-red-500 flex items-center gap-1" title="Start over (Esc)">
                    <ArrowLeft className="w-3 h-3" /> New
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between text-[11px] text-gray-400">
                <span className="flex items-center gap-1.5">
                  <span className={'w-1.5 h-1.5 rounded-full ' + (unavailableCount > 0 ? 'bg-red-500' : 'bg-green-500')} />
                  {statusLoading
                    ? 'Checking converter availability…'
                    : unavailableCount > 0
                      ? `${unavailableCount} converter${unavailableCount > 1 ? 's are' : ' is'} unavailable right now`
                      : statusSummary
                        ? 'All converters reachable'
                        : 'Availability checks unavailable'}
                  {statusSummary && <span className="text-gray-300 dark:text-gray-600">·</span>}
                  {statusSummary && <span>{statusSummary}</span>}
                </span>
                <button
                  onClick={loadConverterStatus}
                  disabled={statusLoading}
                  className="flex items-center gap-1 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40"
                  title="Re-check every converter now"
                >
                  <RefreshCw className={'w-3 h-3' + (statusLoading ? ' animate-spin' : '')} /> Check again
                </button>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 space-y-1.5">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">How to download:</p>
                <ol className="text-[11px] text-gray-500 list-decimal list-inside pl-1"><li>Click a converter {'\u2014'} opens in new tab</li><li>Your URL is <strong>auto-copied</strong></li><li>Press Ctrl+V to paste, convert and download</li></ol>
              </div>
              {launched && (
                <div role="status" aria-live="polite" className="flex items-center gap-2 text-xs text-green-700 bg-green-50 dark:bg-green-950/30 dark:text-green-400 px-3 py-2 rounded-lg">
                  <Check className="w-4 h-4 flex-shrink-0" />
                  {launched.copied
                    ? `URL copied! Paste in ${launched.name} tab with Ctrl+V`
                    : `Auto-copy was blocked by your browser — press Ctrl+C to copy, then paste in the ${launched.name} tab`}
                </div>
              )}
              <div className="space-y-2.5">
                {convList.map((svc: Converter) => (
                  <div
                    key={svc.name}
                    role="button"
                    tabIndex={0}
                    onClick={() => openConverter(svc)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openConverter(svc);
                      }
                    }}
                    className="w-full flex items-center gap-3 p-3.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-800 transition-all text-left group hover:shadow-md cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  >
                    <div className={'w-11 h-11 rounded-lg bg-gradient-to-br ' + svc.color + ' flex items-center justify-center text-white flex-shrink-0 shadow-md'}>
                      <Download className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-sm">{svc.name}</span>
                        {svc.recommended && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">BEST</span>}
                        {(() => {
                          const status = converterStatus[svc.name];
                          if (!status || status.status === 'unknown') {
                            return (
                              <span className="flex items-center gap-1 text-[10px] font-medium text-gray-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" /> Checking…
                              </span>
                            );
                          }
                          if (status.status === 'working') {
                            return (
                              <span title={status.checkedAt ? `Working — checked ${new Date(status.checkedAt).toLocaleTimeString()}${status.latencyMs != null ? ` (${status.latencyMs}ms)` : ''}` : 'Working'} className="flex items-center gap-1 text-[10px] font-medium text-green-700 dark:text-green-400">
                                <CheckCircle2 className="w-3 h-3" /> Working
                              </span>
                            );
                          }
                          return (
                            <span
                              title={status.error ? `Unavailable — ${status.error}${status.statusCode ? ` (HTTP ${status.statusCode})` : ''}` : 'Unavailable'}
                              className="flex items-center gap-1 text-[10px] font-medium text-red-600 dark:text-red-400"
                            >
                              <XCircle className="w-3 h-3" /> Unavailable
                            </span>
                          );
                        })()}
                        {converterStatus[svc.name]?.reports ? (
                          <span className="flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400" title={`Flagged by users ${converterStatus[svc.name]?.reports} time${converterStatus[svc.name]?.reports === 1 ? '' : 's'}`}>
                            <Flag className="w-2.5 h-2.5" /> flagged
                          </span>
                        ) : null}
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5">{svc.desc}</p>
                    </div>
                    <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                      <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-red-500 transition-colors" />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); setReportFor(svc); setReportDone(false); }}
                          aria-label={`Report ${svc.name} as broken or unsafe`}
                          title="Report dead or unsafe converter"
                          className="p-0.5 group/flag"
                        >
                          <Flag className={'w-3.5 h-3.5 transition-colors ' + (converterStatus[svc.name]?.reports ? 'text-amber-500' : 'text-gray-300 group-hover/flag:text-red-500')} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); toggleFav(svc.name); }} aria-label={svc.name === favorite ? `Remove ${svc.name} from favorites` : `Favorite ${svc.name}`} className="p-0.5">
                          <Star className={'w-3.5 h-3.5 ' + (svc.name === favorite ? 'text-yellow-500' : 'text-gray-300')} fill={svc.name === favorite ? 'currentColor' : 'none'} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div role="alert" className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-red-200 dark:border-red-900 p-5 space-y-3">
            <div className="flex items-start gap-2 text-red-600">
              <CircleX className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
            <button onClick={handleReset} className="text-sm font-medium text-red-600">Try Again</button>
          </div>
        )}

        {phase === 'input' && (
          <div className="grid grid-cols-3 gap-3 mt-2">
            {[
              { Icon: Music, t: 'Audio', d: 'Convert to MP3' },
              { Icon: Film, t: 'Video', d: 'Download MP4' },
              { Icon: Zap, t: 'Fast', d: 'Paste and go' },
            ].map(f => (
              <div key={f.t} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3 text-center hover:shadow-md transition-shadow">
                <div className="w-9 h-9 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-2">
                  <f.Icon className="w-5 h-5 text-red-500" />
                </div>
                <h3 className="font-semibold text-xs">{f.t}</h3>
                <p className="text-[10px] text-gray-500 mt-0.5">{f.d}</p>
              </div>
            ))}
          </div>
        )}

        {phase === 'input' && (
          <div className="mt-6">
            <h3 className="text-xs font-semibold text-center mb-3 text-gray-400 uppercase tracking-wider">Supported Platforms</h3>
            <div className="flex flex-wrap justify-center gap-3">
              <div className="flex flex-col items-center gap-1.5 group">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8Z" fill="white"/><path d="m9.75 15.02 5.75-3.02-5.75-3.02v6.04Z" fill="#FF0000"/></svg>
                </div>
                <span className="text-[11px] font-medium text-gray-500">YouTube</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 group">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-600 to-red-700 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <img src="https://cdn.simpleicons.org/youtubemusic/ffffff" width="24" height="24" alt="" />
                </div>
                <span className="text-[11px] font-medium text-gray-500">YT Music</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 group">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <img src="https://cdn.simpleicons.org/soundcloud/ffffff" width="24" height="24" alt="" />
                </div>
                <span className="text-[11px] font-medium text-gray-500">SoundCloud</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 group">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-gray-800 to-black flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="white" aria-hidden="true" focusable="false"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </div>
                <span className="text-[11px] font-medium text-gray-500">X</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 group">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-500 via-purple-500 to-orange-400 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <img src="https://cdn.simpleicons.org/instagram/ffffff" width="24" height="24" alt="" />
                </div>
                <span className="text-[11px] font-medium text-gray-500">Instagram</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 group">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
                </div>
                <span className="text-[11px] font-medium text-gray-500">Spotify</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 group">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <img src="https://cdn.simpleicons.org/deezer/ffffff" width="24" height="24" alt="" />
                </div>
                <span className="text-[11px] font-medium text-gray-500">Deezer</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 group">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-500 to-red-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <img src="https://cdn.simpleicons.org/applemusic/ffffff" width="24" height="24" alt="" />
                </div>
                <span className="text-[11px] font-medium text-gray-500">Apple Music</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 group">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-gray-900 to-black flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <img src="https://cdn.simpleicons.org/tiktok/ffffff" width="24" height="24" alt="" />
                </div>
                <span className="text-[11px] font-medium text-gray-500">TikTok</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 group">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <img src="https://cdn.simpleicons.org/facebook/ffffff" width="24" height="24" alt="" />
                </div>
                <span className="text-[11px] font-medium text-gray-500">Facebook</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 group">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FFFC00] to-[#E6E200] flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <img src="/snapchat-logo.png" width="24" height="24" alt="" />
                </div>
                <span className="text-[11px] font-medium text-gray-500">Snapchat</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 group">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-gray-900 to-black flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><text x="50%" y="54%" dominantBaseline="middle" textAnchor="middle" fontFamily="system-ui,sans-serif" fontSize="7" fontWeight="800" fill="white" letterSpacing="-0.2">BeReal.</text></svg>
                </div>
                <span className="text-[11px] font-medium text-gray-500">BeReal</span>
              </div>
            </div>
          </div>
        )}
        {phase === 'input' && history.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 space-y-3 mt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-gray-500">Recent</h3>
              <button onClick={clearHist} className="text-[11px] text-gray-400 hover:text-red-500">Clear</button>
            </div>
            {history.slice(0, 4).map(h => (
              <button key={h.url} onClick={() => setUrl(h.url)} className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left">
                <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 bg-gray-200 dark:bg-gray-700"><span className="text-[8px] font-bold text-gray-600 dark:text-gray-300">{platformLabel(h.platform).charAt(0)}</span></div>
                <span className="text-xs text-gray-500 truncate flex-1">{h.title}</span>
              </button>
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-gray-200 dark:border-gray-800 py-3 mt-auto">
        <p className="text-center text-[11px] text-gray-400">
          YT Convert {'\u2014'} For personal use only {'\u00B7'}{' '}
          <NextLink href="/faq" className="hover:text-red-500 underline-offset-2 hover:underline transition-colors">FAQ</NextLink>
          {' \u00B7 '}
          <NextLink href="/privacy" className="hover:text-red-500 underline-offset-2 hover:underline transition-colors">Privacy</NextLink>
          {' \u00B7 '}
          <NextLink href="/terms" className="hover:text-red-500 underline-offset-2 hover:underline transition-colors">Terms</NextLink>
        </p>
      </footer>

      {dragging && (
        <div className="fixed inset-0 z-[70] bg-red-500/10 dark:bg-red-500/20 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="bg-white dark:bg-gray-900 border-2 border-dashed border-red-400 dark:border-red-700 rounded-2xl px-8 py-6 text-center shadow-xl">
            <LinkIcon className="w-6 h-6 text-red-500 mx-auto mb-2" />
            <p className="text-sm font-semibold">Drop your link here</p>
            <p className="text-[11px] text-gray-500 mt-1">YouTube, Spotify, TikTok and 9 more</p>
          </div>
        </div>
      )}

      {reportFor && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Report ${reportFor.name}`}
          className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={closeReport}
        >
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <Flag className="w-4 h-4 text-red-500" /> Report {reportFor.name}
              </h2>
              <button onClick={closeReport} aria-label="Close report dialog" className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {reportDone ? (
              <div className="space-y-3">
                <p className="text-sm text-green-700 dark:text-green-400 flex items-start gap-2" role="status" aria-live="polite">
                  <Check className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  Thanks — this converter has been flagged for review. The site owner sees your report on the status dashboard.
                </p>
                <button onClick={closeReport} className="w-full h-10 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm font-semibold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                  Done
                </button>
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-500">What&apos;s wrong with this converter?</p>
                <div className="space-y-2">
                  {REPORT_OPTIONS.map(opt => (
                    <label
                      key={opt.key}
                      className={
                        'block rounded-xl border p-3 cursor-pointer transition-colors ' +
                        (reportIssue === opt.key
                          ? 'border-red-400 bg-red-50 dark:bg-red-950/30'
                          : 'border-gray-200 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-800')
                      }
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="report-issue"
                          value={opt.key}
                          checked={reportIssue === opt.key}
                          onChange={() => setReportIssue(opt.key)}
                          className="accent-red-600"
                        />
                        <span className="text-xs font-semibold">{opt.label}</span>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-1 ml-6">{opt.hint}</p>
                    </label>
                  ))}
                </div>
                <textarea
                  value={reportNote}
                  onChange={e => setReportNote(e.target.value)}
                  maxLength={500}
                  rows={2}
                  placeholder="Optional details (what happened?)"
                  className="w-full text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 p-2.5 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
                />
                {reportError && (
                  <p role="alert" className="text-xs text-red-600 dark:text-red-400">{reportError}</p>
                )}
                <button
                  onClick={submitReport}
                  disabled={reportSending}
                  className="w-full h-10 rounded-xl bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-sm font-semibold shadow-lg shadow-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {reportSending ? 'Sending…' : 'Send report'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {showHelp && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts"
          className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowHelp(false)}
        >
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl w-full max-w-sm p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm flex items-center gap-2"><Keyboard className="w-4 h-4" /> Keyboard shortcuts</h2>
              <button onClick={() => setShowHelp(false)} aria-label="Close keyboard shortcuts" className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <ul className="space-y-2 text-xs text-gray-500 dark:text-gray-400">
              {[
                ['/', 'Focus the link box'],
                ['Enter', 'Fetch info'],
                ['Esc', 'Start over / close dialogs'],
                ['?', 'Toggle this panel'],
                ['Ctrl + V', 'Paste your link into the converter tab'],
              ].map(([k, d]) => (
                <li key={k} className="flex items-center justify-between gap-3">
                  <span>{d}</span>
                  <kbd className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 font-mono text-[11px] text-gray-700 dark:text-gray-300 flex-shrink-0">{k}</kbd>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-gray-400">You can also drag and drop a link anywhere on the page.</p>
          </div>
        </div>
      )}
    </div>
  );
}
