/*
 * YT Convert for Android — GPLv3 companion app.
 * Copyright (C) 2026 rahmanjimmy504-code
 *
 * The converter screen. Adapted from the YT Convert website (src/app/page.tsx),
 * dual-licensed by its copyright holder under the GNU General Public License
 * v3 or later for this repository.
 *
 * Differences from the website, all deliberate (see README "What changes on
 * Android"): metadata comes from the native extractor instead of
 * /api/video-info, "Download here" calls the Kotlin plugin instead of
 * /api/convert, there is no CAPTCHA (nothing is consuming a public server),
 * and audio is labelled honestly as M4A/WebM rather than MP3.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version. See <https://www.gnu.org/licenses/>.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleX,
  Clipboard,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Film,
  Info,
  Link as LinkIcon,
  Moon,
  Music,
  Play,
  Share2,
  Smartphone,
  Star,
  Sun,
  X,
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
import {
  ALL_CONVERTERS,
  buildConverterLaunchUrl,
  hasAutomaticHandoff,
  type Converter,
} from '@/lib/converters';
import { getEmbed } from '@/lib/embed';
import { deriveDownloadPanelState, qualityDowngradeNote } from '@/lib/download-panel';
import {
  ANDROID_DOWNLOAD_APPS,
  buildAndroidDownloadIntent,
  type AndroidDownloadApp,
} from '@/lib/android-download-apps';
import { AUDIO_KBPS_OPTIONS, VIDEO_QUALITY_OPTIONS } from '@/lib/formats';
import {
  readExtractorStatus,
  isNativeAndroid,
  YTExtractor,
  type ExtractorStatus,
  type MediaInfo,
} from '@/lib/extractor';
import {
  STORAGE_KEYS,
  pushHistory,
  sGet,
  sGetJ,
  sRemove,
  sSet,
  type HistoryItem,
} from '@/lib/storage';
import { copyText, openExternal, openIntent, readClipboard } from '@/lib/external';
import { LogoTile } from '@/components/logo';
import { PlatformGrid } from '@/components/platform-grid';

type Phase = 'input' | 'loading' | 'ready' | 'error';

const tips = [
  'Paste any link from YouTube, Spotify, SoundCloud, X, Instagram, Deezer, Apple Music, Amazon Music, TikTok, Facebook, Snapchat or BeReal.',
  'Downloads run on this phone, over your own connection — no server in the middle.',
  'AUTO-SEND converters receive your link. COPY NEEDED converters ask you to paste.',
  'If one converter has ads, try another.',
  'All converters are free, no sign-up needed.',
  'Tap Go after pasting to fetch info instantly.',
  'Tap Preview to watch or listen before downloading.',
  'Audio keeps its real container: usually M4A or WebM, not MP3.',
];

const placeholders = [
  'https://www.youtube.com/watch?v=...',
  'https://open.spotify.com/track/...',
  'https://soundcloud.com/...',
  'https://x.com/user/status/...',
  'https://www.instagram.com/reel/...',
  'https://music.apple.com/...',
  'https://music.amazon.com/...',
  'https://www.deezer.com/track/...',
  'https://music.youtube.com/watch?v=...',
  'https://www.tiktok.com/...',
  'https://www.facebook.com/...',
  'https://www.snapchat.com/add/...',
  'https://bereal.com/...',
];

export default function ConverterScreen() {
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState<FormatKey>('mp4');
  const [audioQuality, setAudioQuality] = useState<string>('best');
  const [videoQuality, setVideoQuality] = useState<string>('best');
  const [phase, setPhase] = useState<Phase>('input');
  const [error, setError] = useState('');
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [extractor, setExtractor] = useState<ExtractorStatus>({ available: false });
  const [launched, setLaunched] = useState<{ name: string; copied: boolean } | null>(null);
  const [tipIdx, setTipIdx] = useState(0);
  const [phIdx, setPhIdx] = useState(0);
  const [dark, setDark] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [favorite, setFavorite] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [savedTo, setSavedTo] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const downloadIdRef = useRef<string | null>(null);
  const reqIdRef = useRef(0);

  // Restore preferences, history and extractor availability on mount.
  useEffect(() => {
    const saved = sGet(STORAGE_KEYS.dark);
    const isDark = saved !== '' ? saved === '1' : window.matchMedia('(prefers-color-scheme:dark)').matches;
    setDark(isDark);
    document.documentElement.classList.toggle('dark', isDark);
    setHistory(sGetJ<HistoryItem[]>(STORAGE_KEYS.history) || []);
    setFavorite(sGet(STORAGE_KEYS.favorite));

    const f = sGet(STORAGE_KEYS.format);
    if (f === 'mp3' || f === 'mp4') setFormat(f);
    const aq = sGet(STORAGE_KEYS.audioQuality);
    if ((AUDIO_KBPS_OPTIONS as readonly string[]).includes(aq)) setAudioQuality(aq);
    const vq = sGet(STORAGE_KEYS.videoQuality);
    if ((VIDEO_QUALITY_OPTIONS as readonly string[]).includes(vq)) setVideoQuality(vq);

    void readExtractorStatus().then(setExtractor);

    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  // Foreground-download events from the native plugin.
  useEffect(() => {
    const handles: Array<{ remove: () => Promise<void> }> = [];
    void YTExtractor.addListener('downloadProgress', event => {
      if (event.id !== downloadIdRef.current) return;
      setProgress(event.percent);
    }).then(h => handles.push(h));
    void YTExtractor.addListener('downloadComplete', event => {
      if (event.id !== downloadIdRef.current) return;
      downloadIdRef.current = null;
      setDownloading(false);
      setProgress(null);
      setSavedTo(`${event.displayName} (${event.container.toUpperCase()})`);
    }).then(h => handles.push(h));
    void YTExtractor.addListener('downloadFailed', event => {
      if (event.id !== downloadIdRef.current) return;
      downloadIdRef.current = null;
      setDownloading(false);
      setProgress(null);
      setDownloadError(event.message || 'The download failed.');
    }).then(h => handles.push(h));
    return () => {
      handles.forEach(h => void h.remove());
    };
  }, []);

  useEffect(() => {
    const i = setInterval(() => setTipIdx(t => (t + 1) % tips.length), 5000);
    return () => clearInterval(i);
  }, []);
  useEffect(() => {
    const i = setInterval(() => setPhIdx(p => (p + 1) % placeholders.length), 4000);
    return () => clearInterval(i);
  }, []);

  const toggleDark = useCallback(() => {
    setDark(prev => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      sSet(STORAGE_KEYS.dark, next ? '1' : '0');
      return next;
    });
  }, []);

  const scrollToResult = useCallback(() => {
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }, []);

  const handleGetInfo = useCallback(async () => {
    const u = url.trim();
    const platform = detectPlatform(u);
    if (!u || !platform) {
      setError('Paste a link from one of the supported platforms.');
      setPhase('error');
      return;
    }
    const reqId = ++reqIdRef.current;
    const stale = () => reqId !== reqIdRef.current;

    setPhase('loading');
    setError('');
    setDownloadError('');
    setSavedTo('');
    setPreviewOpen(false);

    const videoId = extractYouTubeId(u);
    const fallbackThumb =
      (platform === 'youtube' || platform === 'youtubemusic') && videoId
        ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
        : '';

    try {
      const info = await YTExtractor.getInfo({ url: u });
      if (stale()) return;
      setMediaInfo({
        ...info,
        title: info.title || 'Unknown',
        thumbnail: info.thumbnail || fallbackThumb,
        platform: info.platform || platform,
      });
      setHistory(prev =>
        pushHistory(prev, { title: info.title || 'Unknown', url: u, platform, time: Date.now() }),
      );
    } catch {
      if (stale()) return;
      // No native extractor yet (MVP) or the lookup failed. Degrade
      // gracefully: the card still renders with what we can know locally, so
      // the converter list and preview stay reachable.
      setMediaInfo({
        title: '',
        author: '',
        thumbnail: fallbackThumb,
        duration: '',
        views: '',
        published: '',
        platform,
      });
      setHistory(prev => pushHistory(prev, { title: u, url: u, platform, time: Date.now() }));
    } finally {
      if (!stale()) {
        setPhase('ready');
        scrollToResult();
      }
    }
  }, [url, scrollToResult]);

  const handlePaste = useCallback(async () => {
    const text = await readClipboard();
    if (text) {
      setUrl(text);
      setPhase('input');
      setError('');
      setMediaInfo(null);
    }
  }, []);

  const handleFormatChange = useCallback((f: FormatKey) => {
    setFormat(f);
    sSet(STORAGE_KEYS.format, f);
  }, []);
  const handleAudioQualityChange = useCallback((q: string) => {
    setAudioQuality(q);
    sSet(STORAGE_KEYS.audioQuality, q);
  }, []);
  const handleVideoQualityChange = useCallback((q: string) => {
    setVideoQuality(q);
    sSet(STORAGE_KEYS.videoQuality, q);
  }, []);

  const handleReset = useCallback(() => {
    reqIdRef.current++;
    setUrl('');
    setPhase('input');
    setError('');
    setMediaInfo(null);
    setLaunched(null);
    setLinkCopied(false);
    setPreviewOpen(false);
    setDownloadError('');
    setSavedTo('');
    setDownloading(false);
    setProgress(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const clearUrl = useCallback(() => {
    setUrl('');
    setPhase('input');
    setError('');
    setMediaInfo(null);
    setLaunched(null);
    setPreviewOpen(false);
    setDownloadError('');
    inputRef.current?.focus();
  }, []);

  const copyLink = useCallback(async () => {
    const ok = await copyText(url.trim());
    setLinkCopied(ok);
    if (ok) {
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setLinkCopied(false), 2000);
    }
  }, [url]);

  const shareLink = useCallback(async () => {
    const u = url.trim();
    if (!u) return;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: mediaInfo?.title || 'YT Convert', text: mediaInfo?.title || u, url: u });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    }
    await copyLink();
  }, [url, mediaInfo, copyLink]);

  const videoId = mediaInfo ? extractYouTubeId(url.trim()) : null;
  const embed = mediaInfo ? getEmbed(mediaInfo.platform as PlatformKey, url.trim()) : null;
  const detected = url.trim() ? detectPlatform(url.trim()) : null;

  const openOriginal = useCallback(() => {
    if (phase !== 'ready') return;
    openExternal(videoId ? `https://www.youtube.com/watch?v=${videoId}` : url.trim());
  }, [phase, videoId, url]);

  const convList = (() => {
    const platform = mediaInfo?.platform || detected;
    if (!platform) return ALL_CONVERTERS.slice(0, 4);
    return ALL_CONVERTERS.filter(c => c.platforms.includes(platform as PlatformKey)).sort((a, b) => {
      if (a.name === favorite) return -1;
      if (b.name === favorite) return 1;
      const am = a.formats.includes(format) ? 1 : 0;
      const bm = b.formats.includes(format) ? 1 : 0;
      if (am !== bm) return bm - am;
      if (a.recommended && !b.recommended) return -1;
      if (b.recommended && !a.recommended) return 1;
      return 0;
    });
  })();

  const openConverter = (converter: Converter) => {
    const u = url.trim();
    // Converters are third-party websites: always hand them to the phone's
    // browser rather than loading them inside this app's WebView.
    openExternal(u ? buildConverterLaunchUrl(converter, u) : converter.url);
    setLaunched({ name: converter.name, copied: false });
    if (u) void copyText(u).then(copied => setLaunched({ name: converter.name, copied }));
  };

  const openAndroidDownloadApp = (app: AndroidDownloadApp) => {
    const id = extractYouTubeId(url.trim());
    if (!id) return;
    const mediaUrl = `https://www.youtube.com/watch?v=${id}`;
    const intent = buildAndroidDownloadIntent(app, mediaUrl);
    if (!intent) return;
    void copyText(mediaUrl);
    if (isNativeAndroid() || /Android/i.test(navigator.userAgent)) openIntent(intent);
    else openExternal(app.installUrl);
  };

  const downloadHere = async () => {
    if (downloading) return;
    const u = url.trim();
    setDownloadError('');
    setSavedTo('');
    setDownloading(true);
    setProgress(-1);
    try {
      const handle = await YTExtractor.startDownload({
        url: u,
        format,
        quality: format === 'mp3' ? audioQuality : videoQuality,
        title: mediaInfo?.title || '',
      });
      downloadIdRef.current = handle.id;
    } catch (err) {
      downloadIdRef.current = null;
      setDownloading(false);
      setProgress(null);
      const message = err instanceof Error ? err.message : '';
      setDownloadError(
        message === 'NOT_IMPLEMENTED'
          ? 'On-device downloading is not built into this version yet. Use an Android app or a converter below.'
          : message || 'Could not download this link on the device.',
      );
    }
  };

  const cancelDownload = async () => {
    const id = downloadIdRef.current;
    if (!id) return;
    try {
      await YTExtractor.cancelDownload({ id });
    } catch {
      /* the notification's Cancel action may already have stopped it */
    }
    downloadIdRef.current = null;
    setDownloading(false);
    setProgress(null);
  };

  const toggleFav = (name: string) => {
    const value = favorite === name ? '' : name;
    setFavorite(value);
    sSet(STORAGE_KEYS.favorite, value);
  };
  const clearHist = () => {
    setHistory([]);
    sRemove(STORAGE_KEYS.history);
  };

  const downloadPanel = deriveDownloadPanelState(mediaInfo?.platform, extractor.available);
  const videoPlan = mediaInfo?.videoQualityPlans?.find(p => p.quality === videoQuality);
  const videoPlanNote = videoPlan ? qualityDowngradeNote(videoPlan, videoQuality) : null;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900 text-gray-900 dark:text-white">
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 cursor-pointer select-none min-w-0" onClick={handleReset}>
            <LogoTile />
            <div className="min-w-0">
              <h1 className="text-base font-bold tracking-tight">YT Convert</h1>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                YouTube {'\u00B7'} YT Music {'\u00B7'} SoundCloud {'\u00B7'} X {'\u00B7'} Instagram {'\u00B7'} Spotify{' '}
                {'\u00B7'} Deezer {'\u00B7'} Apple Music {'\u00B7'} Amazon Music {'\u00B7'} TikTok {'\u00B7'} Facebook{' '}
                {'\u00B7'} Snapchat {'\u00B7'} BeReal
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/faq"
              className="h-9 px-3 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs font-semibold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              FAQ
            </Link>
            <button
              onClick={toggleDark}
              aria-label="Toggle dark mode"
              title="Toggle dark mode"
              className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 space-y-5">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-800 transition-colors p-5 space-y-4">
          <label htmlFor="url-input" className="text-sm font-semibold">
            Paste any link
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={inputRef}
                id="url-input"
                type="url"
                inputMode="url"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder={placeholders[phIdx]}
                value={url}
                onChange={e => {
                  setUrl(e.target.value);
                  if (phase === 'error') {
                    setPhase('input');
                    setError('');
                  }
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (phase === 'input' || phase === 'error')) void handleGetInfo();
                }}
                disabled={phase === 'loading'}
                className={
                  'w-full pl-10 h-11 text-sm rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent placeholder:text-gray-400 dark:text-white ' +
                  (url && (phase === 'input' || phase === 'error') ? 'pr-9' : 'pr-3')
                }
              />
              {url && (phase === 'input' || phase === 'error') && (
                <button
                  type="button"
                  onClick={clearUrl}
                  aria-label="Clear link"
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {(phase === 'input' || phase === 'error') && (
              <button
                onClick={() => void handleGetInfo()}
                disabled={!url.trim()}
                aria-disabled={!url.trim()}
                title="Fetch link information"
                className="h-11 px-5 rounded-xl bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-sm font-semibold shadow-lg shadow-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                Go <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {(phase === 'input' || phase === 'error') && (
              <button
                onClick={() => void handlePaste()}
                className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1 transition-colors"
              >
                <Clipboard className="w-3.5 h-3.5" /> Paste from clipboard
              </button>
            )}
            {detected && phase === 'input' && (
              <span className={'text-xs font-medium px-2.5 py-0.5 rounded-full ' + platformColor(detected)}>
                {platformLabel(detected)}
              </span>
            )}
          </div>

          {phase === 'input' && (
            <div className="space-y-2">
              <label className="text-sm font-semibold">Format</label>
              <div className="grid grid-cols-2 h-11 rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
                <button
                  onClick={() => handleFormatChange('mp3')}
                  className={
                    'rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ' +
                    (format === 'mp3' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500')
                  }
                >
                  <Music className="w-4 h-4" /> Audio
                </button>
                <button
                  onClick={() => handleFormatChange('mp4')}
                  className={
                    'rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ' +
                    (format === 'mp4' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500')
                  }
                >
                  <Film className="w-4 h-4" /> MP4
                </button>
              </div>
            </div>
          )}

          {phase === 'input' && <p className="text-xs text-gray-400 text-center animate-pulse">{tips[tipIdx]}</p>}
        </div>

        {phase === 'loading' && (
          <div
            role="status"
            aria-live="polite"
            className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-red-200 dark:border-red-900 p-8 text-center space-y-3"
          >
            <div className="w-8 h-8 border-[3px] border-red-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-gray-600 dark:text-gray-300">Fetching info on this device…</p>
          </div>
        )}

        {phase === 'ready' && mediaInfo && (
          <div ref={resultRef} className="space-y-5">
            <div className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-red-200 dark:border-red-900 overflow-hidden p-5 space-y-4">
              {mediaInfo.thumbnail && (
                <div
                  className="relative rounded-xl overflow-hidden bg-black group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  role="button"
                  tabIndex={0}
                  aria-label="Open the original link"
                  onClick={openOriginal}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openOriginal();
                    }
                  }}
                >
                  <img
                    src={mediaInfo.thumbnail}
                    alt={mediaInfo.title || 'Thumbnail'}
                    className="w-full object-cover"
                    style={{ maxHeight: '360px' }}
                    onError={e => {
                      const img = e.currentTarget;
                      if (videoId && !img.src.endsWith('/mqdefault.jpg')) {
                        img.src = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
                      } else {
                        img.style.display = 'none';
                      }
                    }}
                  />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-14 h-14 rounded-full bg-red-600 flex items-center justify-center">
                      <Play className="w-6 h-6 text-white ml-0.5" fill="currentColor" />
                    </div>
                  </div>
                  {mediaInfo.duration && (
                    <span className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-0.5 rounded">
                      {mediaInfo.duration}
                    </span>
                  )}
                </div>
              )}

              {previewOpen && embed && (
                <div
                  className={
                    embed.kind === 'video'
                      ? 'aspect-video w-full rounded-xl overflow-hidden bg-black'
                      : embed.kind === 'tiktok'
                        ? 'max-w-[325px] mx-auto h-[560px] rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800'
                        : mediaInfo.platform === 'spotify'
                          ? 'h-[152px] rounded-xl overflow-hidden'
                          : 'h-[300px] rounded-xl overflow-hidden'
                  }
                >
                  <iframe
                    src={embed.url}
                    title={'Preview of ' + (mediaInfo.title || 'the media')}
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
                  <h3 className="font-semibold text-sm line-clamp-2">
                    {mediaInfo.title || 'Could not load info'}
                  </h3>
                  {mediaInfo.author && <p className="text-xs text-gray-500 mt-1">{mediaInfo.author}</p>}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {mediaInfo.views && <span className="text-[11px] text-gray-400">{mediaInfo.views} views</span>}
                    {mediaInfo.published && <span className="text-[11px] text-gray-400">{mediaInfo.published}</span>}
                    {embed && (
                      <button
                        onClick={() => setPreviewOpen(p => !p)}
                        className="text-[11px] font-medium text-red-600 dark:text-red-400 hover:opacity-75 transition-opacity flex items-center gap-1"
                      >
                        {previewOpen ? (
                          <>
                            <EyeOff className="w-3 h-3" /> Hide preview
                          </>
                        ) : (
                          <>
                            <Eye className="w-3 h-3" /> Preview
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
                {mediaInfo.platform && (
                  <span
                    className={
                      'text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ' + platformColor(mediaInfo.platform)
                    }
                  >
                    {platformLabel(mediaInfo.platform)}
                  </span>
                )}
              </div>

              {downloadPanel.kind !== 'unavailable' && (
                <div className="rounded-xl border-2 border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20 p-4 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-semibold text-sm flex items-center gap-2">
                      <Download className="w-4 h-4 text-red-600 dark:text-red-400" />
                      Download here
                    </h2>
                    <span className="text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded-full bg-red-600 text-white">
                      ON DEVICE
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    The download runs on this phone over your own connection — nothing passes through a server.
                    {format === 'mp3'
                      ? ' Audio keeps its real container: usually M4A or WebM, not MP3.'
                      : ' Video is progressive MP4 when the platform provides one.'}
                  </p>

                  <div className="grid grid-cols-2 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 p-1">
                    <button
                      onClick={() => handleFormatChange('mp3')}
                      className={
                        'rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1.5 ' +
                        (format === 'mp3' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500')
                      }
                    >
                      <Music className="w-3.5 h-3.5" /> Audio
                    </button>
                    <button
                      onClick={() => handleFormatChange('mp4')}
                      className={
                        'rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1.5 ' +
                        (format === 'mp4' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500')
                      }
                    >
                      <Film className="w-3.5 h-3.5" /> Video
                    </button>
                  </div>

                  {format === 'mp3' ? (
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                        Bitrate
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
                      {videoPlanNote && (
                        <p
                          role="status"
                          className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-300/60 dark:border-amber-800/60 rounded-lg px-2.5 py-2"
                        >
                          <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                          <span>{videoPlanNote}</span>
                        </p>
                      )}
                    </div>
                  )}

                  {downloadPanel.kind === 'ready' ? (
                    downloading ? (
                      <div className="space-y-2">
                        <div className="h-2 w-full rounded-full bg-red-100 dark:bg-red-950 overflow-hidden">
                          <div
                            className={
                              'h-full bg-gradient-to-r from-red-500 to-red-600 transition-all ' +
                              (progress != null && progress >= 0 ? '' : 'animate-pulse w-1/3')
                            }
                            style={progress != null && progress >= 0 ? { width: `${progress}%` } : undefined}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
                          <span>
                            {progress != null && progress >= 0
                              ? `Downloading… ${Math.round(progress)}%`
                              : 'Downloading…'}{' '}
                            Progress also shows in your notifications.
                          </span>
                          <button onClick={() => void cancelDownload()} className="font-semibold hover:text-red-500">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void downloadHere()}
                        className="w-full h-11 rounded-xl bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-sm font-semibold shadow-lg shadow-red-500/20 transition-all flex items-center justify-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        {format === 'mp3' ? 'Download audio' : 'Download video'}
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      disabled
                      aria-disabled
                      title={extractor.reason || 'On-device extraction is not available in this build'}
                      className="w-full h-11 rounded-xl bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-sm font-semibold cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      On-device download not available yet
                    </button>
                  )}

                  {downloadPanel.kind === 'no-extractor' && (
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 flex items-start gap-1.5">
                      <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" />
                      <span>
                        {extractor.reason ||
                          'This build ships the interface only. On-device extraction arrives in a later release; use an app below or a converter for now.'}
                      </span>
                    </p>
                  )}

                  {savedTo && (
                    <p
                      role="status"
                      className="text-[11px] text-green-700 dark:text-green-400 flex items-start gap-1.5 bg-green-50 dark:bg-green-950/30 rounded-lg px-2.5 py-2"
                    >
                      <Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      <span>Saved to your device: {savedTo}</span>
                    </p>
                  )}

                  {downloadError && (
                    <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                      {downloadError}
                    </p>
                  )}

                  {videoId && (mediaInfo.platform === 'youtube' || mediaInfo.platform === 'youtubemusic') && (
                    <div className="border-t border-red-200/80 dark:border-red-900 pt-3 space-y-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-semibold flex items-center gap-1.5">
                          <Smartphone className="w-3.5 h-3.5" /> Download with another free Android app
                        </p>
                        <span className="text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                          ON DEVICE
                        </span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                        Tap an app to open it with this video. If it is not installed, Android opens its official
                        download page. The link is copied as a fallback.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {ANDROID_DOWNLOAD_APPS.map(app => (
                          <button
                            key={app.name}
                            type="button"
                            onClick={() => openAndroidDownloadApp(app)}
                            className="min-h-14 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-gray-900 px-3 py-2 text-left hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                          >
                            <span className="flex items-center justify-between gap-2 text-xs font-semibold text-gray-800 dark:text-gray-200">
                              {app.name}
                              <ExternalLink className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                            </span>
                            <span className="block mt-0.5 text-[10px] leading-snug text-gray-500 dark:text-gray-400">
                              {app.description}
                            </span>
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-gray-400">
                        Choose audio/video and quality inside the app. Audio downloads may use M4A or WebM rather than
                        MP3.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {downloadPanel.kind === 'unavailable' && (
                <p className="text-xs text-gray-500 dark:text-gray-400 flex items-start gap-1.5">
                  <CircleX className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" />
                  <span>{downloadPanel.reason} Use a converter below if you have a licensed option.</span>
                </p>
              )}
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-gray-200 dark:border-gray-800 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-base">Converters</h2>
                  <span className="text-[11px] text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                    {convList.length}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {linkCopied ? (
                    <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Link copied
                    </span>
                  ) : (
                    <button
                      onClick={() => void copyLink()}
                      className="text-xs text-gray-500 hover:text-red-500 flex items-center gap-1"
                    >
                      <Clipboard className="w-3 h-3" /> Copy link
                    </button>
                  )}
                  <button
                    onClick={() => void shareLink()}
                    className="text-xs text-gray-500 hover:text-red-500 flex items-center gap-1"
                  >
                    <Share2 className="w-3 h-3" /> Share
                  </button>
                  <button
                    onClick={handleReset}
                    className="text-xs text-gray-500 hover:text-red-500 flex items-center gap-1"
                  >
                    <ArrowLeft className="w-3 h-3" /> New
                  </button>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 space-y-1.5">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">How to download:</p>
                <ol className="text-[11px] text-gray-500 list-decimal list-inside pl-1">
                  <li>Use Download here when it is available, or tap a converter below</li>
                  <li>COPY NEEDED converters ask you to paste the link on the next page</li>
                  <li>Choose quality / kbps on the converter page if you used a third-party site</li>
                </ol>
              </div>

              {launched && (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-2 text-xs text-green-700 bg-green-50 dark:bg-green-950/30 dark:text-green-400 px-3 py-2 rounded-lg"
                >
                  <Check className="w-4 h-4 flex-shrink-0" />
                  {launched.copied
                    ? `Opened ${launched.name} in your browser. AUTO-SEND converters already have the link; otherwise paste if asked.`
                    : `Opened ${launched.name} in your browser. If it is COPY NEEDED, paste the link on the next page.`}
                </div>
              )}

              <div className="space-y-2.5">
                {convList.map(svc => (
                  <div
                    key={svc.name}
                    role="button"
                    tabIndex={0}
                    onClick={() => openConverter(svc)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openConverter(svc);
                      }
                    }}
                    className="w-full flex items-center gap-3 p-3.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-800 transition-all text-left group hover:shadow-md cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  >
                    <div
                      className={
                        'w-11 h-11 rounded-lg bg-gradient-to-br ' +
                        svc.color +
                        ' flex items-center justify-center text-white flex-shrink-0 shadow-md'
                      }
                    >
                      <Download className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-sm">{svc.name}</span>
                        {svc.recommended && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                            BEST
                          </span>
                        )}
                        {hasAutomaticHandoff(svc) ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                            AUTO-SEND
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                            COPY NEEDED
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5">{svc.desc}</p>
                    </div>
                    <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                      <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-red-500 transition-colors" />
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          toggleFav(svc.name);
                        }}
                        aria-label={svc.name === favorite ? `Remove ${svc.name} from favourites` : `Favourite ${svc.name}`}
                        className="p-0.5"
                      >
                        <Star
                          className={'w-3.5 h-3.5 ' + (svc.name === favorite ? 'text-yellow-500' : 'text-gray-300')}
                          fill={svc.name === favorite ? 'currentColor' : 'none'}
                        />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div
            role="alert"
            className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-red-200 dark:border-red-900 p-5 space-y-3"
          >
            <div className="flex items-start gap-2 text-red-600">
              <CircleX className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
            <button onClick={handleReset} className="text-sm font-medium text-red-600">
              Try Again
            </button>
          </div>
        )}

        {phase === 'input' && (
          <div className="grid grid-cols-3 gap-3 mt-2">
            {[
              { Icon: Music, t: 'Audio', d: 'M4A or WebM' },
              { Icon: Film, t: 'Video', d: 'Download MP4' },
              { Icon: Zap, t: 'On device', d: 'No server' },
            ].map(f => (
              <div
                key={f.t}
                className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3 text-center hover:shadow-md transition-shadow"
              >
                <div className="w-9 h-9 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-2">
                  <f.Icon className="w-5 h-5 text-red-500" />
                </div>
                <h3 className="font-semibold text-xs">{f.t}</h3>
                <p className="text-[10px] text-gray-500 mt-0.5">{f.d}</p>
              </div>
            ))}
          </div>
        )}

        {phase === 'input' && <PlatformGrid />}

        {phase === 'input' && history.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 space-y-3 mt-2">
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
        <p className="text-center text-[11px] text-gray-400">
          YT Convert {'\u2014'} For personal use only {'\u00B7'}{' '}
          <Link to="/faq" className="hover:text-red-500 underline-offset-2 hover:underline transition-colors">
            FAQ
          </Link>
          {' \u00B7 '}
          <Link to="/privacy" className="hover:text-red-500 underline-offset-2 hover:underline transition-colors">
            Privacy
          </Link>
          {' \u00B7 '}
          <Link to="/terms" className="hover:text-red-500 underline-offset-2 hover:underline transition-colors">
            Terms
          </Link>
          {' \u00B7 '}
          <Link to="/licence" className="hover:text-red-500 underline-offset-2 hover:underline transition-colors">
            Licence
          </Link>
        </p>
      </footer>
    </div>
  );
}
