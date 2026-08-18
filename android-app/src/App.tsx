// SPDX-License-Identifier: GPL-3.0-or-later
import { useCallback, useEffect, useRef, useState } from 'react';
import { describeRuntime, extractorReady } from './lib/runtime';
import {
  detectPlatform,
  extractYouTubeId,
  platformColor,
  platformLabel,
  canConvertPlatform,
  canExtractOnDevice,
  convertUnavailableReason,
  type PlatformKey,
} from './lib/platforms';
import {
  AUDIO_KBPS_OPTIONS,
  AUDIO_TARGETS,
  KIND_STORAGE_KEY,
  TARGETS,
  TARGET_STORAGE_KEY,
  VIDEO_QUALITY_OPTIONS,
  isAudioTarget,
  isTranscodeTarget,
  parseStoredKind,
  targetAvailable,
  targetUnavailableReason,
  type AudioTarget,
  type DownloadTarget,
  type MediaKind,
} from './lib/formats';
import {
  ANDROID_DOWNLOAD_APPS,
  buildAndroidDownloadIntent,
  type AndroidDownloadApp,
} from './lib/android-download-apps';
import {
  YTExtractor,
  describeDownloadedFile,
  describeExtractionFailure,
  describeProgressLine,
  type DownloadProgressEvent,
} from './lib/yt-extractor';

const SOURCE_URL = 'https://github.com/rahmanjimmy504-code/yt-convert';
const LICENSE_URL = `${SOURCE_URL}/blob/main/LICENSE`;

type Phase = 'input' | 'ready' | 'error';

interface HistoryItem {
  title: string;
  url: string;
  platform: string;
  time: number;
}

/* ---------- tiny inline icon set (lucide path data, MIT) ---------- */

type IconProps = { size?: number; className?: string };

function DownloadIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function MusicIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

function FilmIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
      <line x1="7" y1="2" x2="7" y2="22" />
      <line x1="17" y1="2" x2="17" y2="22" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="2" y1="7" x2="7" y2="7" />
      <line x1="2" y1="17" x2="7" y2="17" />
      <line x1="17" y1="17" x2="22" y2="17" />
      <line x1="17" y1="7" x2="22" y2="7" />
    </svg>
  );
}

function ClipboardIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  );
}

function MoonIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function SunIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

function ExternalLinkIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

function XIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function PlayIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="m6 3 14 9-14 9V3Z" />
    </svg>
  );
}

function InfoIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function Logo() {
  return (
    <div className="flex items-center justify-center w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-red-500 to-red-600 shadow-lg shadow-red-500/20">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
        <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8Z" fill="white" />
        <path d="m9.75 15.02 5.75-3.02-5.75-3.02v6.04Z" fill="#FF0000" />
      </svg>
    </div>
  );
}

/* ---------- storage helpers (WebView localStorage) ---------- */

function sGet(k: string): string {
  try {
    return localStorage.getItem(k) || '';
  } catch {
    return '';
  }
}
function sSet(k: string, v: string): void {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* storage may be unavailable in a privacy browser */
  }
}
function sGetJ<T>(k: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(k) || 'null') as T;
  } catch {
    return null;
  }
}
function sSetJ(k: string, v: unknown): void {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

/** Copy text to the clipboard, reporting whether it actually worked. */
async function copyText(t: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    return false;
  }
}

const TIPS = [
  'Paste any link from YouTube, SoundCloud, X, Instagram, TikTok or Facebook.',
  'YouTube downloads run on this phone over your own connection — that usually clears the bot check.',
  'DRM catalogs (Spotify, Deezer, Apple Music, Amazon Music) are never ripped.',
  'Your link stays on this device: there is no server in the middle.',
];

const PLACEHOLDERS = [
  'https://www.youtube.com/watch?v=...',
  'https://soundcloud.com/...',
  'https://x.com/user/status/...',
  'https://www.instagram.com/reel/...',
  'https://www.tiktok.com/...',
];

const KIND_LABELS: Record<MediaKind, string> = { audio: 'Audio', video: 'Video' };

export default function App() {
  const runtime = describeRuntime();
  // True only inside the Capacitor shell with the Kotlin YTExtractor plugin
  // registered. The real download button gates on this — a browser preview or
  // a shell without the plugin never claims a download it cannot perform.
  const nativeReady = extractorReady();

  const [mounted, setMounted] = useState(false);
  const [url, setUrl] = useState('');
  const [kind, setKind] = useState<MediaKind>('video');
  const [audioTarget, setAudioTarget] = useState<AudioTarget>('m4a');
  // Device API level from YTExtractor.ping(); null until probed (or in a
  // browser shell). Encoder-gated chips (FLAC/Opus) stay disabled until known.
  const [apiLevel, setApiLevel] = useState<number | null>(null);
  const [audioQuality, setAudioQuality] = useState<string>('best');
  const [videoQuality, setVideoQuality] = useState<string>('best');
  const [phase, setPhase] = useState<Phase>('input');
  const [error, setError] = useState('');
  const [dark, setDark] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [tipIdx, setTipIdx] = useState(0);
  const [phIdx, setPhIdx] = useState(0);
  const [launched, setLaunched] = useState<{ name: string; copied: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [nativeStatus, setNativeStatus] = useState('');
  const [nativeError, setNativeError] = useState('');
  const [downloadEvent, setDownloadEvent] = useState<DownloadProgressEvent | null>(null);
  const activeDownloadId = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
    const s = sGet('yt-convert-android-dark');
    const d = s !== '' ? s === '1' : window.matchMedia('(prefers-color-scheme:dark)').matches;
    setDark(d);
    document.documentElement.classList.toggle('dark', d);
    setHistory(sGetJ<HistoryItem[]>('yt-convert-android-history') || []);
    // Restore the format picker. New keys win; the legacy mp3/mp4 key from
    // older installs maps onto the equivalent defaults (audio → M4A, video).
    const legacyFormat = sGet('yt-convert-android-format');
    const storedKindRaw =
      sGet(KIND_STORAGE_KEY) || (legacyFormat === 'mp3' ? 'audio' : legacyFormat === 'mp4' ? 'video' : '');
    setKind(parseStoredKind(storedKindRaw || null));
    // Restore the exact stored audio target; encoder gating is re-checked
    // once ping() reports the device API level below.
    const storedTarget = sGet(TARGET_STORAGE_KEY);
    setAudioTarget(isAudioTarget(storedTarget) ? storedTarget : 'm4a');
    const aq = sGet('yt-convert-android-audio-quality');
    if ((AUDIO_KBPS_OPTIONS as readonly string[]).includes(aq)) setAudioQuality(aq);
    const vq = sGet('yt-convert-android-video-quality');
    if ((VIDEO_QUALITY_OPTIONS as readonly string[]).includes(vq)) setVideoQuality(vq);
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  useEffect(() => {
    const i = setInterval(() => setTipIdx(t => (t + 1) % TIPS.length), 5000);
    return () => clearInterval(i);
  }, []);

  // Ask the native plugin for the device API level so encoder-gated targets
  // (FLAC needs Android 12, Opus Android 10) can gate their chips honestly.
  // In a browser shell ping() would reject; gating stays conservative there.
  useEffect(() => {
    if (!nativeReady) return;
    let disposed = false;
    YTExtractor.ping()
      .then(p => {
        if (!disposed) setApiLevel(typeof p.apiLevel === 'number' ? p.apiLevel : null);
      })
      .catch(() => {
        /* keep apiLevel unknown: chips stay honestly disabled */
      });
    return () => {
      disposed = true;
    };
  }, [nativeReady]);

  // A restored choice that this device cannot encode falls back to M4A.
  useEffect(() => {
    if (apiLevel !== null && !targetAvailable(audioTarget, apiLevel)) setAudioTarget('m4a');
  }, [apiLevel, audioTarget]);

  // Background-download progress from the native foreground service. Only the
  // download this session started is shown; terminal states flip into the
  // status/error rows below the button.
  useEffect(() => {
    if (!nativeReady) return;
    let disposed = false;
    let handle: { remove: () => Promise<void> } | null = null;
    YTExtractor.addListener('downloadProgress', event => {
      if (disposed || event.downloadId !== activeDownloadId.current) return;
      if (event.state === 'progress') {
        setDownloadEvent(event);
        return;
      }
      setDownloadEvent(null);
      activeDownloadId.current = null;
      if (event.state === 'completed') {
        setNativeError('');
        setNativeStatus(`Saved \u201c${event.title}\u201d to Downloads/YTConvert.`);
      } else if (event.state === 'cancelled') {
        setNativeError('');
        setNativeStatus('Download cancelled.');
      } else {
        setNativeStatus('');
        setNativeError(
          event.error || 'The background download failed. Try again, or use one of the free Android apps below.',
        );
      }
    })
      .then(h => {
        if (disposed) void h.remove();
        else handle = h;
      })
      .catch(() => {
        /* no plugin in this shell — nothing to subscribe to */
      });
    return () => {
      disposed = true;
      if (handle) void handle.remove();
    };
  }, [nativeReady]);
  useEffect(() => {
    const i = setInterval(() => setPhIdx(p => (p + 1) % PLACEHOLDERS.length), 4000);
    return () => clearInterval(i);
  }, []);

  const dp: PlatformKey | null = url.trim() ? detectPlatform(url.trim()) : null;

  const toggleDark = useCallback(() => {
    setDark(prev => {
      const n = !prev;
      document.documentElement.classList.toggle('dark', n);
      sSet('yt-convert-android-dark', n ? '1' : '0');
      return n;
    });
  }, []);

  const recordHistory = useCallback((u: string, plat: PlatformKey) => {
    setHistory(prev => {
      const h = [
        { title: platformLabel(plat) || 'Link', url: u, platform: plat, time: Date.now() },
        ...prev.filter(x => x.url !== u),
      ].slice(0, 6);
      sSetJ('yt-convert-android-history', h);
      return h;
    });
  }, []);

  const handleGo = useCallback(() => {
    const u = url.trim();
    if (!u) return;
    const plat = detectPlatform(u);
    if (!plat) {
      setError('Unsupported URL.');
      setPhase('error');
      return;
    }
    setError('');
    setLaunched(null);
    setNativeStatus('');
    setNativeError('');
    setDownloadEvent(null);
    recordHistory(u, plat);
    setPhase('ready');
  }, [url, recordHistory]);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text);
        setPhase('input');
        setError('');
      }
    } catch {
      /* clipboard read may be denied */
    }
  }, []);

  const clearUrl = useCallback(() => {
    setUrl('');
    setPhase('input');
    setError('');
    setLaunched(null);
    setNativeStatus('');
    setNativeError('');
    setDownloadEvent(null);
    inputRef.current?.focus();
  }, []);

  const handleReset = useCallback(() => {
    clearUrl();
  }, [clearUrl]);

  const handleUrlChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setUrl(e.target.value);
      if (phase === 'error') {
        setPhase('input');
        setError('');
      }
    },
    [phase],
  );

  const handleKindChange = useCallback((k: MediaKind) => {
    setKind(k);
    setNativeStatus('');
    setNativeError('');
    setDownloadEvent(null);
    sSet(KIND_STORAGE_KEY, k);
  }, []);

  const handleTargetChange = useCallback((t: AudioTarget) => {
    setAudioTarget(t);
    setNativeStatus('');
    setNativeError('');
    setDownloadEvent(null);
    sSet(TARGET_STORAGE_KEY, t);
  }, []);
  const handleAudioQualityChange = useCallback((q: string) => {
    setAudioQuality(q);
    sSet('yt-convert-android-audio-quality', q);
  }, []);
  const handleVideoQualityChange = useCallback((q: string) => {
    setVideoQuality(q);
    sSet('yt-convert-android-video-quality', q);
  }, []);

  const clearHist = useCallback(() => {
    setHistory([]);
    try {
      localStorage.removeItem('yt-convert-android-history');
    } catch {
      /* ignore */
    }
  }, []);

  const videoId = phase === 'ready' ? extractYouTubeId(url.trim()) : null;

  /** The concrete output file type the native side will be asked to save. */
  const activeTarget: DownloadTarget = kind === 'audio' ? audioTarget : 'mp4';
  const activeSpec = TARGETS[activeTarget];
  const transcode = kind === 'audio' && isTranscodeTarget(activeTarget);
  /** Bitrate row semantics: encoder setting for transcodes, source pick for M4A. */
  const bitrateRowVisible = kind === 'audio' && activeSpec.bitrateRelevant;

  const openAndroidDownloadApp = useCallback(
    (app: AndroidDownloadApp) => {
      const id = extractYouTubeId(url.trim());
      if (!id) return;
      const mediaUrl = `https://www.youtube.com/watch?v=${id}`;
      const intent = buildAndroidDownloadIntent(app, mediaUrl);
      if (!intent) return;
      void copyText(mediaUrl).then(copied => setLaunched({ name: app.name, copied }));
      if (/Android/i.test(navigator.userAgent)) {
        window.location.assign(intent);
      } else {
        window.open(app.installUrl, '_blank', 'noopener');
      }
    },
    [url],
  );

  /**
   * The real download path: native Innertube extraction over the phone's own
   * connection, then the foreground service saves one allowlist-checked stream
   * or combines an adaptive H.264/AAC pair directly in Downloads/YTConvert.
   * Only reachable when YTExtractor is registered (nativeReady); otherwise the
   * UI shows the honest free-app handoffs instead.
   */
  const handleNativeDownload = useCallback(async () => {
    const u = url.trim();
    if (!u || busy) return;
    setBusy(true);
    setNativeError('');
    setNativeStatus('');
    setDownloadEvent(null);
    try {
      const stream = await YTExtractor.extract({
        url: u,
        format: kind,
        // Transcodes always take the best source stream; the bitrate row
        // configures the encoder instead. M4A keeps source-bitrate picking.
        quality: kind === 'audio' ? (transcode ? 'best' : audioQuality) : videoQuality,
        target: activeTarget,
      });
      const started = await YTExtractor.download({
        url: stream.url,
        audioUrl: stream.audioUrl,
        totalBytes: stream.totalBytes,
        title: stream.title,
        extension: stream.extension,
        mimeType: stream.mimeType,
        extractAudio: stream.extractAudio,
        target: activeTarget,
        transcode,
        audioBitrate: kind === 'audio' ? audioQuality : undefined,
      });
      activeDownloadId.current = started.downloadId;
      // Seed the progress row; real events from the foreground service
      // replace it as the bytes arrive.
      setDownloadEvent({
        downloadId: started.downloadId,
        state: 'progress',
        filename: started.filename,
        title: stream.title,
        receivedBytes: 0,
        totalBytes: stream.totalBytes ?? -1,
        percent: -1,
        muxing: started.muxing,
        extractAudio: started.extractAudio ?? false,
        transcoding: started.transcoding ?? transcode,
      });
      setNativeStatus(describeDownloadedFile(stream, started));
    } catch (err) {
      setNativeError(describeExtractionFailure(err));
    } finally {
      setBusy(false);
    }
  }, [url, kind, audioTarget, transcode, audioQuality, videoQuality, busy]);

  const handleCancelDownload = useCallback(() => {
    const id = activeDownloadId.current;
    if (id == null) return;
    void YTExtractor.cancelDownload({ downloadId: id }).catch(() => {
      /* a cancel that arrives after completion is harmless */
    });
  }, []);

  /**
   * The honest free-app handoff panel (Seal / YTDLnis / NewPipe). Shown when
   * the native extractor is absent for a YouTube link, or when a native
   * extraction just failed and the visitor still wants their file.
   */
  /**
   * The audio file-type chip row (M4A / MP3 / WAV / FLAC / Opus). Chips whose
   * encoder needs a newer Android than this device (or than ping() could
   * confirm) are disabled with the reason as their tooltip — never a button
   * that silently fails.
   */
  const renderTargetChips = () => (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Audio file type">
      {AUDIO_TARGETS.map(t => {
        const reason = targetUnavailableReason(t.key, apiLevel);
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => handleTargetChange(t.key)}
            disabled={reason !== null}
            aria-pressed={audioTarget === t.key}
            title={reason ?? t.description}
            className={
              'px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors ' +
              (audioTarget === t.key
                ? 'bg-red-600 text-white border-red-600'
                : reason !== null
                  ? 'bg-gray-50 dark:bg-gray-800/50 text-gray-300 dark:text-gray-600 border-gray-100 dark:border-gray-800 cursor-not-allowed'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-800')
            }
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );

  const renderFreeAppsPanel = (lead: string) =>
    videoId ? (
      <div className="border-t border-red-200/80 dark:border-red-900 pt-3 space-y-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs font-semibold">Download with a free Android app</p>
          <span className="text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            ON DEVICE
          </span>
        </div>
        <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">{lead}</p>
        <div className="grid grid-cols-1 gap-2">
          {ANDROID_DOWNLOAD_APPS.map(app => (
            <button
              key={app.name}
              type="button"
              onClick={() => openAndroidDownloadApp(app)}
              className="min-h-14 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-gray-900 px-3 py-2 text-left hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
              title={`Open ${app.name} on Android or visit its official install page`}
            >
              <span className="flex items-center justify-between gap-2 text-xs font-semibold text-gray-800 dark:text-gray-200">
                {app.name}
                <ExternalLinkIcon className="text-emerald-600 flex-shrink-0" />
              </span>
              <span className="block mt-0.5 text-[10px] leading-snug text-gray-500 dark:text-gray-400">
                {app.description}
              </span>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-gray-400">
          Choose audio/video and quality inside the app. NewPipe audio downloads may use M4A or WebM rather than
          MP3.
        </p>
        {launched && (
          <p role="status" aria-live="polite" className="text-xs text-green-700 dark:text-green-400">
            {launched.copied
              ? `Opened ${launched.name}. The link is also on your clipboard.`
              : `Opened ${launched.name}.`}
          </p>
        )}
      </div>
    ) : null;

  if (!mounted) {
    return (
      <div className="min-h-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900">
        <div className="w-8 h-8 border-[3px] border-red-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-full flex flex-col bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900 text-gray-900 dark:text-white">
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <button type="button" onClick={handleReset} className="flex items-center gap-3 cursor-pointer select-none min-w-0">
            <Logo />
            <div className="min-w-0 text-left">
              <h1 className="text-base font-bold tracking-tight leading-tight">YT Convert</h1>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                {runtime.native ? 'On-device · Android' : 'Android shell · dev'}
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={toggleDark}
            aria-label="Toggle dark mode"
            title="Toggle dark mode"
            className="w-9 h-9 shrink-0 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-md mx-auto w-full px-4 py-6 space-y-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-800 transition-colors p-5 space-y-4">
          <label htmlFor="url-input" className="text-sm font-semibold">
            Paste any link
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                id="url-input"
                type="url"
                inputMode="url"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder={PLACEHOLDERS[phIdx]}
                value={url}
                onChange={handleUrlChange}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleGo();
                }}
                className={
                  'w-full pl-3 h-11 text-sm rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent placeholder:text-gray-400 dark:text-white ' +
                  (url ? 'pr-9' : 'pr-3')
                }
              />
              {url && (
                <button
                  type="button"
                  onClick={clearUrl}
                  aria-label="Clear link"
                  title="Clear link"
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <XIcon />
                </button>
              )}
            </div>
            <button
              onClick={handleGo}
              disabled={!url.trim()}
              aria-disabled={!url.trim()}
              className="h-11 px-5 rounded-xl bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-sm font-semibold shadow-lg shadow-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Go
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handlePaste}
              className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1 transition-colors"
            >
              <ClipboardIcon /> Paste from clipboard
            </button>
            {dp && phase === 'input' && (
              <span className={'text-xs font-medium px-2.5 py-0.5 rounded-full ' + platformColor(dp)}>
                {platformLabel(dp)}
              </span>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold">Format</label>
            <div className="grid grid-cols-2 h-11 rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
              <button
                onClick={() => handleKindChange('audio')}
                className={
                  'rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ' +
                  (kind === 'audio' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500')
                }
              >
                <MusicIcon size={16} /> Audio
              </button>
              <button
                onClick={() => handleKindChange('video')}
                className={
                  'rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ' +
                  (kind === 'video' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500')
                }
              >
                <FilmIcon size={16} /> Video
              </button>
            </div>
            {kind === 'audio' && (
              <div className="space-y-1.5">
                {renderTargetChips()}
                <p className="text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                  {activeSpec.description}
                </p>
              </div>
            )}
          </div>

          <p className="text-xs text-gray-400 text-center animate-pulse">{TIPS[tipIdx]}</p>
        </div>

        {phase === 'ready' && dp && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-red-200 dark:border-red-900 overflow-hidden p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-sm">{KIND_LABELS[kind]} · {platformLabel(dp)}</h3>
                  {videoId && <p className="text-xs text-gray-500 mt-1 font-mono">{videoId}</p>}
                </div>
                <span className={'text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ' + platformColor(dp)}>
                  {platformLabel(dp)}
                </span>
              </div>

              {videoId && (
                <div className="relative rounded-xl overflow-hidden bg-black">
                  <img
                    src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
                    alt="Video thumbnail"
                    className="w-full object-cover"
                    style={{ maxHeight: '220px' }}
                    onError={e => {
                      const img = e.currentTarget;
                      if (!img.src.endsWith('/mqdefault.jpg')) img.src = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
                      else img.style.display = 'none';
                    }}
                  />
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center">
                      <PlayIcon className="text-white ml-0.5" />
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 p-1">
                <button
                  onClick={() => handleKindChange('audio')}
                  className={
                    'rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1.5 ' +
                    (kind === 'audio' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500')
                  }
                >
                  <MusicIcon size={14} /> Audio
                </button>
                <button
                  onClick={() => handleKindChange('video')}
                  className={
                    'rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1.5 ' +
                    (kind === 'video' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500')
                  }
                >
                  <FilmIcon size={14} /> Video
                </button>
              </div>

              {kind === 'audio' ? (
                <div className="space-y-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                      File type
                    </label>
                    {renderTargetChips()}
                  </div>
                  <p className="text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                    {activeSpec.description}
                  </p>
                  {bitrateRowVisible && (
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                        {transcode ? 'Bitrate (re-encode)' : 'Bitrate'}
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {AUDIO_KBPS_OPTIONS.map(q => (
                          <button
                            key={q}
                            type="button"
                            onClick={() => handleAudioQualityChange(q)}
                            aria-pressed={audioQuality === q}
                            className={
                              'px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ' +
                              (audioQuality === q
                                ? 'bg-red-600 text-white border-red-600'
                                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-800')
                            }
                          >
                            {q === 'best' ? 'Best' : `${q} kbps`}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                    Quality
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {VIDEO_QUALITY_OPTIONS.map(q => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => handleVideoQualityChange(q)}
                        aria-pressed={videoQuality === q}
                        className={
                          'px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ' +
                          (videoQuality === q
                            ? 'bg-red-600 text-white border-red-600'
                            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-800')
                        }
                      >
                        {q === 'best' ? 'Best' : `${q}p`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Honest capability status. The real download button exists only
                  when the native YTExtractor plugin is registered AND the
                  platform is in this release's on-device scope (YouTube);
                  everything else degrades instead of pretending. */}
              {!canConvertPlatform(dp) ? (
                <p className="flex items-start gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                  <InfoIcon className="mt-0.5 flex-shrink-0 text-gray-400" />
                  <span>{convertUnavailableReason(dp)}</span>
                </p>
              ) : canExtractOnDevice(dp) && nativeReady ? (
                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={() => void handleNativeDownload()}
                    disabled={busy}
                    aria-busy={busy}
                    className="w-full h-11 rounded-xl bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-sm font-semibold shadow-lg shadow-red-500/20 disabled:opacity-60 disabled:cursor-wait transition-all flex items-center justify-center gap-2"
                  >
                    <DownloadIcon size={16} className={busy ? 'animate-pulse' : undefined} />
                    {busy ? 'Extracting…' : kind === 'audio' ? 'Download audio' : 'Download video'}
                  </button>
                  <p className="flex items-start gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                    <InfoIcon className="mt-0.5 flex-shrink-0 text-gray-400" />
                    <span>
                      {kind === 'audio'
                        ? activeSpec.transcode
                          ? `Runs on this phone over your own connection. The original track is decoded and re-encoded into ${activeSpec.label} on this device${activeSpec.bitrateRelevant ? ' at the chosen bitrate' : ''}.`
                          : 'Runs on this phone over your own connection. Audio is saved as the original AAC/M4A track; when only a combined stream exists, its AAC track is saved as an audio-only M4A without re-encoding.'
                        : 'Runs on this phone over your own connection. Compatible HD video and AAC audio are combined on this device without re-encoding. Video saves as MP4 only.'}
                    </span>
                  </p>
                  {downloadEvent && downloadEvent.state === 'progress' && (
                    <div className="space-y-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 p-2.5">
                      <div className="flex items-center justify-between gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                        <span className="truncate">{describeProgressLine(downloadEvent)}</span>
                        <button
                          type="button"
                          onClick={handleCancelDownload}
                          className="shrink-0 font-medium text-red-500 hover:text-red-600 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                      <div
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={downloadEvent.percent >= 0 ? downloadEvent.percent : undefined}
                        aria-label="Download progress"
                        className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden"
                      >
                        <div
                          className={
                            'h-full bg-gradient-to-r from-red-500 to-red-600 transition-all ' +
                            (downloadEvent.percent >= 0 ? '' : 'w-full animate-pulse')
                          }
                          style={downloadEvent.percent >= 0 ? { width: `${downloadEvent.percent}%` } : undefined}
                        />
                      </div>
                      <p className="text-[10px] text-gray-400">
                        {downloadEvent.extractAudio
                          ? 'Saving the AAC track as an audio-only M4A — stream-copied from the source, no re-encoding. You can leave this screen.'
                          : downloadEvent.muxing
                            ? 'Separate tracks are combined on this device with no re-encode or intermediate file. You can leave this screen.'
                            : 'Continues in the background — you can leave this screen; the notification shows progress.'}
                      </p>
                    </div>
                  )}
                  {nativeStatus && (
                    <p role="status" aria-live="polite" className="text-xs text-green-700 dark:text-green-400">
                      {nativeStatus}
                    </p>
                  )}
                  {nativeError && (
                    <div className="space-y-3">
                      <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                        {nativeError}
                      </p>
                      {renderFreeAppsPanel(
                        'You can still get this video: these free apps download over your own connection — tap one to open it with this video; if it is not installed, Android opens its official download page. The link is copied as a fallback.',
                      )}
                    </div>
                  )}
                </div>
              ) : canExtractOnDevice(dp) ? (
                <div className="space-y-3">
                  {renderFreeAppsPanel(
                    'On-device extraction arrives in the next release. Until then, these free apps download over your own connection — tap one to open it with this video; if it is not installed, Android opens its official download page. The link is copied as a fallback.',
                  )}
                </div>
              ) : (
                <p className="flex items-start gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                  <InfoIcon className="mt-0.5 flex-shrink-0 text-gray-400" />
                  <span>On-device extraction for {platformLabel(dp)} arrives in a later release.</span>
                </p>
              )}
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div role="alert" className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-red-200 dark:border-red-900 p-5 space-y-3">
            <p className="text-sm text-red-600">{error}</p>
            <button onClick={handleReset} className="text-sm font-medium text-red-600">
              Try Again
            </button>
          </div>
        )}

        {phase === 'input' && history.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-gray-500">Recent</h3>
              <button onClick={clearHist} className="text-[11px] text-gray-400 hover:text-red-500">
                Clear
              </button>
            </div>
            {history.slice(0, 4).map(h => (
              <button
                key={h.url}
                onClick={() => setUrl(h.url)}
                className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
              >
                <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 bg-gray-200 dark:bg-gray-700">
                  <span className="text-[8px] font-bold text-gray-600 dark:text-gray-300">
                    {platformLabel(h.platform).charAt(0)}
                  </span>
                </div>
                <span className="text-xs text-gray-500 truncate flex-1">{h.title}</span>
              </button>
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-gray-200 dark:border-gray-800 py-3 mt-auto">
        <p className="text-center text-[11px] text-gray-400 px-4 leading-relaxed">
          YT Convert Android — free software under{' '}
          <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            GPL-3.0-or-later
          </a>
          , with ABSOLUTELY NO WARRANTY.{' '}
          <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            Source
          </a>
        </p>
      </footer>
    </div>
  );
}
