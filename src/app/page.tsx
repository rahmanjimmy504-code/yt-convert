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
import { ALL_CONVERTERS, converterGoPath, type Converter, type ConverterCheckResult } from '@/lib/converters';
import { getEmbed } from '@/lib/embed';
import { OPEN_COOKIE_PREFERENCES_EVENT } from '@/lib/cookies';
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

const tips = ['Paste any link from YouTube, Spotify, SoundCloud, X, Instagram, Deezer, Apple Music, Amazon Music, TikTok, Facebook, Snapchat or BeReal.', 'Click a converter and your link is sent automatically — just pick quality.', 'If one converter has ads, try another.', 'All converters are free, no sign-up needed.', 'Press Enter after pasting to fetch info instantly.', 'Shortcuts: press / to jump to the link box, Esc to start over.', 'Drag and drop a link anywhere on the page to load it.', 'Click Preview to watch or listen before converting.', 'Press ? to see all keyboard shortcuts.'];
const placeholders = ['https://www.youtube.com/watch?v=...', 'https://open.spotify.com/track/...', 'https://soundcloud.com/...', 'https://x.com/user/status/...', 'https://www.instagram.com/reel/...', 'https://music.apple.com/...', 'https://music.amazon.com/...', 'https://www.deezer.com/track/...', 'https://music.youtube.com/watch?v=...', 'https://www.tiktok.com/...', 'https://www.facebook.com/...', 'https://www.snapchat.com/add/...', 'https://bereal.com/...'];

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

  const openConverter = (c: Converter) => {
    const u = url.trim();
    // Open while this click still has transient user activation. Awaiting the
    // clipboard first made browsers treat this as an unsolicited popup.
    window.open(u ? converterGoPath(c.name, u) : c.url, '_blank', 'noopener');

    // Clipboard remains a fallback, but it must not delay the real handoff.
    // Calling copyText now still starts writeText during the click gesture.
    setLaunched({ name: c.name, copied: false });
    if (u) {
      void copyText(u).then(copied => setLaunched({ name: c.name, copied }));
    }

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

  // Converter availability: live probe when it has landed, otherwise the
  // curated catalog badge so cards don't flash "Checking…" for known status.
  const badgeFor = (c: Converter) => {
    const live = converterStatus[c.name]?.status;
    return live && live !== 'unknown' ? live : c.status;
  };
  const statusMinutesAgo = statusCheckedAt ? Math.max(0, Math.round((Date.now() - statusCheckedAt) / 60000)) : null;
  const unavailableCount = convList.filter(c => badgeFor(c) === 'unavailable').length;
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
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 cursor-pointer select-none min-w-0" onClick={handleReset}>
            <div className="flex items-center justify-center w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-red-500 to-red-600 shadow-lg shadow-red-500/20">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8Z" fill="white"/><path d="m9.75 15.02 5.75-3.02-5.75-3.02v6.04Z" fill="#FF0000"/></svg>
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold tracking-tight">YT Convert</h1>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">YouTube {'\u00B7'} YT Music {'\u00B7'} SoundCloud {'\u00B7'} X {'\u00B7'} Instagram {'\u00B7'} Spotify {'\u00B7'} Deezer {'\u00B7'} Apple Music {'\u00B7'} Amazon Music {'\u00B7'} TikTok {'\u00B7'} Facebook {'\u00B7'} Snapchat {'\u00B7'} BeReal</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
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
                <ol className="text-[11px] text-gray-500 list-decimal list-inside pl-1"><li>Click a converter {'\u2014'} your link is sent automatically</li><li>Choose quality / kbps on the converter page</li><li>Download</li></ol>
              </div>
              {launched && (
                <div role="status" aria-live="polite" className="flex items-center gap-2 text-xs text-green-700 bg-green-50 dark:bg-green-950/30 dark:text-green-400 px-3 py-2 rounded-lg">
                  <Check className="w-4 h-4 flex-shrink-0" />
                  {launched.copied
                    ? `Link sent to ${launched.name} — pick your quality / kbps to download`
                    : `Link sent to ${launched.name}. If the box is empty, paste with Ctrl+V then Convert.`}
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
                          const live = converterStatus[svc.name];
                          const badge = badgeFor(svc);
                          if (!badge || badge === 'unknown') {
                            return (
                              <span className="flex items-center gap-1 text-[10px] font-medium text-gray-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" /> Checking…
                              </span>
                            );
                          }
                          if (badge === 'working') {
                            return (
                              <span title={live?.checkedAt ? `Working — checked ${new Date(live.checkedAt).toLocaleTimeString()}${live.latencyMs != null ? ` (${live.latencyMs}ms)` : ''}` : 'Working'} className="flex items-center gap-1 text-[10px] font-medium text-green-700 dark:text-green-400">
                                <CheckCircle2 className="w-3 h-3" /> Working
                              </span>
                            );
                          }
                          return (
                            <span
                              title={live?.error ? `Unavailable — ${live.error}${live.statusCode ? ` (HTTP ${live.statusCode})` : ''}` : 'Unavailable'}
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
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-500 to-sky-700 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="white" aria-hidden="true" focusable="false"><path d="M14.8454 9.4083c-1.3907 1.0194-3.405 1.563-5.1424 1.563a9.333 9.333 0 0 1-6.2768-2.3835c-.1313-.117-.0143-.277.1415-.1846a12.693 12.693 0 0 0 6.285 1.6574c1.5384 0 3.2348-.318 4.7917-.9764.2359-.0985.4328.1538.203.324h-.002zm.5784-.6564c-.1784-.2257-1.1753-.1087-1.6225-.0554-.1374.0164-.158-.1026-.0349-.1867.796-.5558 2.0984-.3958 2.2502-.2092.1539.1867-.041 1.4872-.7856 2.1087-.1149.0964-.2236.0451-.1723-.082.1682-.4165.5436-1.3498.3651-1.5754zm-1.5917-4.1702v-.5394c0-.082.0615-.1375.1374-.1375h2.4348c.078 0 .1395.0554.1395.1354v.4636c0 .078-.0656.1805-.1846.3405L15.0997 6.635c.4677-.0102.9641.0595 1.3887.2974.0964.0534.123.1334.1292.2113v.5744c0 .082-.0882.1723-.1784.123a2.8163 2.8163 0 0 0-2.5723.0062c-.0861.0451-.1743-.0451-.1743-.1251v-.5477c0-.0882.002-.238.0902-.3713l1.4626-2.0881h-1.2718c-.078 0-.1415-.0534-.1436-.1354l.002.002zm4.808-.7466c1.0995 0 1.6944.9395 1.6944 2.1333 0 1.1528-.6564 2.0676-1.6943 2.0676-1.079 0-1.6656-.9395-1.6656-2.1087 0-1.1774.5948-2.0922 1.6656-2.0922zm.0062.7713c-.5456 0-.5805.7384-.5805 1.202 0 .4615-.0061 1.4481.5744 1.4481.5743 0 .601-.7958.601-1.282 0-.318-.0144-.6994-.1108-1.001-.082-.2625-.2482-.3671-.4841-.3671zm-6.008 3.3414c-.0493.041-.1395.0451-.1744.0164-.2543-.1949-.4246-.4923-.4246-.4923-.4061.4123-.6954.5374-1.2225.5374-.6215 0-1.1077-.3835-1.1077-1.1486a1.2512 1.2512 0 0 1 .7897-1.2041c.402-.1764.9641-.2072 1.3928-.2564 0 0 .0349-.4615-.0902-.6297a.521.521 0 0 0-.4164-.1908c-.2728 0-.5395.1477-.5928.4328-.0144.082-.0739.1518-.1395.1436L9.945 5.08a.1292.1292 0 0 1-.1108-.1537c.1641-.8657.9498-1.1282 1.6554-1.1282.361 0 .8307.0964 1.1158.3671.359.3344.3262.7795.3262 1.2677v1.1487c0 .3446.1436.4964.279.681.0471.0677.0574.1477-.002.197-.1519.125-.5703.4881-.5703.4881zm-.7467-1.7969v-.16c-.5353 0-1.1015.115-1.1015.7426 0 .318.1662.5333.4513.5333.2051 0 .3938-.1272.5128-.3344.1436-.2564.1374-.4943.1374-.7815zM2.9278 7.948c-.0472.041-.1375.045-.1723.0163-.2544-.1949-.4246-.4923-.4246-.4923-.4082.4123-.6954.5374-1.2226.5374-.6235 0-1.1076-.3835-1.1076-1.1486a1.2512 1.2512 0 0 1 .7897-1.2041c.402-.1764.964-.2072 1.3928-.2564 0 0 .0348-.4615-.0903-.6297a.521.521 0 0 0-.4164-.1908c-.2748 0-.5395.1477-.5928.4328-.0143.082-.0759.1518-.1395.1436L.2345 5.08a.1292.1292 0 0 1-.1087-.1537c.162-.8657.9497-1.1282 1.6553-1.1282.361 0 .8308.0964 1.1159.3671.359.3344.324.7795.324 1.2677v1.1487c0 .3446.1437.4964.279.681.0472.0677.0575.1477-.002.197-.1518.125-.5702.4881-.5702.4881zm-.7446-1.797v-.16c-.5354 0-1.1015.115-1.1015.7426 0 .318.164.5333.4512.5333.2052 0 .3939-.1272.5128-.3344.1436-.2564.1375-.4943.1375-.7815zm2.9127-.3343v2.002a.1379.1379 0 0 1-.1395.1374H4.218a.1374.1374 0 0 1-.1395-.1374v-3.766a.1379.1379 0 0 1 .1395-.1375h.6913a.1374.1374 0 0 1 .1374.1374v.482h.0143c.1805-.4758.519-.6994.9744-.6994.4636 0 .7528.2236.962.6995a1.0523 1.0523 0 0 1 1.0215-.6995c.3118 0 .6502.1272.8574.4143.236.318.1867.7795.1867 1.1857v2.3855c0 .076-.0636.1354-.1436.1354H8.181a.1374.1374 0 0 1-.1334-.1354v-2.004c0-.16.0144-.558-.0205-.7077-.0554-.2564-.2215-.3282-.4369-.3282a.4923.4923 0 0 0-.441.3118c-.076.1908-.0698.5087-.0698.724v2.0041c0 .076-.0635.1354-.1435.1354h-.7385a.1374.1374 0 0 1-.1333-.1354v-2.004c0-.4226.0677-1.042-.4574-1.042-.5334 0-.5128.603-.5128 1.042h.002zm16.8077 2.002a.1374.1374 0 0 1-.1374.1374h-.7405a.1374.1374 0 0 1-.1374-.1374v-3.766a.1374.1374 0 0 1 .1374-.1375h.683c.0821 0 .1396.0636.1396.1067v.5764h.0143c.2051-.517.4964-.7631 1.0092-.7631.3323 0 .6564.119.8636.4451.1928.3036.1928.8123.1928 1.1774V7.837a.1395.1395 0 0 1-.1415.119h-.7426a.1395.1395 0 0 1-.1313-.119V5.552c0-.763-.2933-.7856-.4635-.7856-.197 0-.357.1538-.4246.2953a1.7025 1.7025 0 0 0-.1231.722l.002 2.0349zM.1914 20.0582c-.1271 0-.1907-.0615-.1907-.1907v-4.4491c0-.1272.0636-.1908.1907-.1908H.616c.0616 0 .1129.0144.1477.039.0349.0246.0595.0738.0718.1436l.0575.3035c.6133-.4184 1.2102-.6276 1.7907-.6276.5948 0 .9969.2256 1.2081.6769.6318-.4513 1.2636-.677 1.8954-.677.441 0 .7794.1231 1.0153.3693.236.2502.3549.603.3549 1.0584v3.3538c0 .1271-.0656.1907-.1928.1907h-.5641c-.1272 0-.1928-.0615-.1928-.1907v-3.085c0-.318-.0616-.5539-.1805-.7057-.1231-.1538-.3139-.2297-.5744-.2297-.4677 0-.9353.1436-1.4092.4307a.997.997 0 0 1 .0103.1416v3.448c0 .1272-.0636.1908-.1908.1908H3.297c-.1272 0-.1908-.0615-.1908-.1907v-3.085c0-.318-.0615-.5539-.1825-.7057-.1231-.1538-.3139-.2297-.5744-.2297-.4861 0-.9517.1395-1.399.4205v3.5999c0 .1271-.0615.1907-.1907.1907H.1914zm9.731.1436c-.4533 0-.8-.1272-1.044-.3815-.242-.2544-.3631-.6133-.3631-1.0769v-3.321c0-.1292.0615-.1927.1908-.1927h.564c.1293 0 .1929.0635.1929.1907v3.0215c0 .3425.0656.5948.201.7569.1333.162.3487.242.642.242.4595 0 .923-.1518 1.3887-.4574v-3.565c0-.1272.0615-.1908.1908-.1908h.564c.1293 0 .1929.0636.1929.1908v4.4511c0 .1252-.0636.1887-.1928.1887h-.4103c-.0636 0-.1149-.0123-.1497-.0369-.0349-.0266-.0575-.0738-.0718-.1436l-.0657-.3323c-.5948.437-1.204.6564-1.8297.6564zm5.4399 0c-.5374 0-1.0195-.0882-1.4461-.2666a.3754.3754 0 0 1-.158-.1047c-.0287-.039-.043-.0984-.043-.1805v-.2687c0-.1148.0369-.1723.1148-.1723.0452 0 .1231.0205.238.0575.4225.1333.8615.199 1.3128.199.3138 0 .5517-.0616.7138-.1806.164-.121.244-.2954.244-.523a.4923.4923 0 0 0-.1476-.3734 1.606 1.606 0 0 0-.5415-.285l-.8144-.3037c-.7097-.2605-1.0625-.7056-1.0625-1.3333 0-.4143.16-.7487.484-1.001.3221-.2543.7447-.3815 1.2677-.3815a3.487 3.487 0 0 1 1.2164.2195c.076.0246.1313.0574.1641.0985.0308.041.0472.1025.0472.1846v.2584c0 .1149-.041.1723-.123.1723a.8615.8615 0 0 1-.2216-.0472 3.5495 3.5495 0 0 0-1.0359-.1538c-.6112 0-.919.2072-.919.6195 0 .164.0514.2953.154.3897.1025.0964.3035.201.603.3159l.7466.2872c.3774.1436.6482.318.8144.519.1661.1989.2482.4574.2482.7753 0 .4513-.1682.8102-.5067 1.0769-.3385.2666-.7877.4-1.3497.4v.002zm3.0645-.1436c-.1272 0-.1928-.0615-.1928-.1907v-4.4491c0-.1272.0656-.1908.1928-.1908h.5641c.1272 0 .1928.0636.1928.1908v4.4511c0 .1251-.0656.1887-.1928.1887h-.564zm.2872-5.688c-.1846 0-.3303-.0513-.437-.1559a.558.558 0 0 1-.1579-.4143c0-.1724.0534-.3098.158-.4144a.5907.5907 0 0 1 .4369-.158c.1846 0 .3282.0534.4349.158.1066.1026.1579.242.1579.4144 0 .1702-.0513.3076-.158.4143-.1046.1026-.2502.1559-.4348.1559zm4.002 5.7926c-.7529 0-1.3293-.2133-1.7272-.642-.4-.4307-.599-1.0502-.599-1.8625 0-.8061.2052-1.4318.6175-1.8728.4102-.441.9948-.6625 1.7476-.6625.3446 0 .683.0615 1.0154.1825.0697.0247.119.0554.1477.0944s.043.1026.043.1908v.2564c0 .1271-.041.1907-.123.1907-.0329 0-.082-.0082-.1539-.0287a2.8307 2.8307 0 0 0-.7959-.1128c-.5353 0-.923.1333-1.1589.404s-.3528.6996-.3528 1.2924v.123c0 .5764.119 1.001.359 1.2718.24.2687.6174.404 1.1343.404.2666 0 .5538-.043.8615-.1332.0718-.0206.119-.0288.1436-.0288.082 0 .1251.0636.1251.1908v.2585c0 .082-.0123.1435-.039.1805-.0246.0369-.0759.0718-.1518.1025-.3138.1354-.6769.201-1.0933.201z"/></svg>
                </div>
                <span className="text-[11px] font-medium text-gray-500">Amazon Music</span>
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
          {/* Reopens the cookie-consent notice (mounted in the root layout). */}
          <button
            onClick={() => window.dispatchEvent(new Event(OPEN_COOKIE_PREFERENCES_EVENT))}
            className="hover:text-red-500 underline-offset-2 hover:underline transition-colors"
          >
            Cookie settings
          </button>
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
