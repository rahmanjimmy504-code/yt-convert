'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleX,
  Clipboard,
  Download,
  ExternalLink,
  Film,
  Link as LinkIcon,
  Moon,
  Music,
  Play,
  Star,
  Sun,
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

interface Converter {
  name: string;
  url: string;
  desc: string;
  color: string;
  platforms: PlatformKey[];
  formats: FormatKey[];
  recommended?: boolean;
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

const tips = ['Paste any link from YouTube, Spotify, SoundCloud, X, Instagram, Deezer, Apple Music, TikTok, Facebook, Snapchat or BeReal.', 'Your URL is auto-copied when you pick a converter.', 'If one converter has ads, try another.', 'All converters are free, no sign-up needed.', 'Press Enter after pasting to fetch info instantly.'];
const placeholders = ['https://www.youtube.com/watch?v=...', 'https://open.spotify.com/track/...', 'https://soundcloud.com/...', 'https://x.com/user/status/...', 'https://www.instagram.com/reel/...', 'https://music.apple.com/...', 'https://www.deezer.com/track/...', 'https://music.youtube.com/watch?v=...', 'https://www.tiktok.com/...', 'https://www.facebook.com/...', 'https://www.snapchat.com/add/...', 'https://bereal.com/...'];

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
  const convertersRef = useRef<HTMLDivElement>(null);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const dp = url.trim() ? detectPlatform(url.trim()) : null;

  const scrollToConverters = useCallback(() => {
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => convertersRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  }, []);

  const handleGetInfo = useCallback(async () => {
    const u = url.trim();
    if (!u) return;
    const plat = detectPlatform(u);
    if (!plat) { setError('Unsupported URL.'); setPhase('error'); return; }
    setError(''); setPhase('loading'); setVideoInfo(null); setLaunched(null);
    try {
      const r = await fetch('/api/video-info?url=' + encodeURIComponent(u));
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error((d as { error?: string }).error || 'Failed'); }
      const data = (await r.json()) as Partial<VideoInfo>;
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
    } catch {
      setVideoInfo({ title: 'Could not load info', author: '', thumbnail: '', duration: '', views: '', published: '', platform: plat });
      setPhase('ready');
      scrollToConverters();
    }
  }, [url, scrollToConverters]);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) { setUrl(text); setPhase('input'); setError(''); setVideoInfo(null); }
    } catch {}
  }, []);

  useEffect(() => {
    if (autoTimer.current) { clearTimeout(autoTimer.current); autoTimer.current = null; }
    if (phase === 'input' || phase === 'error') {
      const u = url.trim();
      if (detectPlatform(u) && u.length > 15 && /^https?:\/\//i.test(u)) {
        autoTimer.current = setTimeout(() => handleGetInfo(), 800);
      }
    }
    return () => { if (autoTimer.current) { clearTimeout(autoTimer.current); autoTimer.current = null; } };
  }, [url, phase, handleGetInfo]);

  const handleFormatChange = useCallback((f: FormatKey) => {
    setFormat(f);
    sSet('yt-convert-format', f);
  }, []);

  const videoId = videoInfo ? extractYouTubeId(url.trim()) : null;

  const all: Converter[] = [
    { name: '9Convert', url: 'https://9convert.org/', desc: 'YouTube to MP3 and MP4. Fast and reliable.', color: 'from-rose-500 to-rose-600', platforms: ['youtube', 'youtubemusic'], formats: ['mp3', 'mp4'], recommended: true },
    { name: 'Y2Mate', url: 'https://v27.www-y2mate.com/', desc: 'MP4 (144p-1080p) and MP3 (128-320kbps).', color: 'from-orange-500 to-orange-600', platforms: ['youtube', 'youtubemusic'], formats: ['mp3', 'mp4'] },
    { name: 'AudioConverter', url: 'https://audioconverter.ai/youtube-to-mp4-converter', desc: 'YouTube to MP4. HD and 4K.', color: 'from-sky-500 to-sky-600', platforms: ['youtube', 'youtubemusic'], formats: ['mp4'] },
    { name: 'Hicoo', url: 'https://hicoo.ai/mp4-converter/youtube-to-mp4', desc: 'YouTube to MP4. 360p to 4K.', color: 'from-emerald-500 to-emerald-600', platforms: ['youtube', 'youtubemusic'], formats: ['mp4'] },
    { name: 'KlickAud', url: 'https://www.klickaud.co/', desc: 'SoundCloud to MP3.', color: 'from-orange-400 to-orange-500', platforms: ['soundcloud'], formats: ['mp3'], recommended: true },
    { name: 'SSSTik', url: 'https://ssstik.io/', desc: 'X/Twitter video downloader.', color: 'from-sky-400 to-sky-500', platforms: ['twitter'], formats: ['mp4'], recommended: true },
    { name: 'Twitsave', url: 'https://twitsave.com/', desc: 'Save X/Twitter videos in HD.', color: 'from-indigo-500 to-indigo-600', platforms: ['twitter'], formats: ['mp4'] },
    { name: 'SaveInsta', url: 'https://www.saveinsta.app/', desc: 'Instagram photos and videos.', color: 'from-pink-400 to-pink-500', platforms: ['instagram'], formats: ['mp4'], recommended: true },
    { name: 'iGram', url: 'https://igram.io/', desc: 'Instagram reels and stories.', color: 'from-purple-500 to-purple-600', platforms: ['instagram'], formats: ['mp4'] },
    { name: 'SpotDown', url: 'https://spotdown.org/', desc: 'Spotify tracks to MP3.', color: 'from-green-500 to-green-600', platforms: ['spotify'], formats: ['mp3'], recommended: true },
    { name: 'DeezLoad', url: 'https://deezerdownloader.net/', desc: 'Deezer tracks to MP3.', color: 'from-purple-500 to-purple-600', platforms: ['deezer'], formats: ['mp3'], recommended: true },
    { name: 'AM Downloader', url: 'https://apple-music-downloader.com/', desc: 'Apple Music to MP3.', color: 'from-gray-600 to-gray-800', platforms: ['applemusic'], formats: ['mp3'], recommended: true },
    { name: 'TTSave', url: 'https://ttsave.app/', desc: 'TikTok videos without watermark.', color: 'from-pink-500 to-pink-600', platforms: ['tiktok'], formats: ['mp4'], recommended: true },
    { name: 'SnapTik', url: 'https://snaptik.app/', desc: 'TikTok to MP4, no watermark.', color: 'from-cyan-500 to-cyan-600', platforms: ['tiktok'], formats: ['mp4'] },
    { name: 'FBDown', url: 'https://fbdown.net/', desc: 'Facebook videos in HD.', color: 'from-blue-600 to-blue-700', platforms: ['facebook'], formats: ['mp4'], recommended: true },
    { name: 'VDFR', url: 'https://vdfr.app/snapchat-video-downloader', desc: 'Download Snapchat videos.', color: 'from-yellow-400 to-yellow-500', platforms: ['snapchat'], formats: ['mp4'], recommended: true },
    { name: 'ViewSnapStories', url: 'https://viewsnapstories.com/snapchat-video-downloader', desc: 'Save Snapchat videos fast.', color: 'from-yellow-500 to-yellow-600', platforms: ['snapchat'], formats: ['mp4'] },
    { name: 'BeReal Saver', url: 'https://berealsaver.com/', desc: 'Download BeReal photos and videos.', color: 'from-gray-900 to-black', platforms: ['br'], formats: ['mp4'] },
  ];

  const getConverters = useCallback(() => {
    const plat = videoInfo?.platform || (url.trim() ? detectPlatform(url.trim()) : null);
    if (!plat) return all.slice(0, 4);
    return all
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
    let copied = false;
    try {
      await navigator.clipboard.writeText(u);
      copied = true;
    } catch {
      copied = false; // clipboard blocked by browser permissions; open anyway
    }
    setLaunched({ name: c.name, copied });
    window.open(c.url, '_blank', 'noopener');
  };
  const toggleFav = (n: string) => { const v = favorite === n ? '' : n; setFavorite(v); sSet('yt-convert-fav', v); };
  const clearHist = () => { setHistory([]); if (typeof window !== 'undefined') localStorage.removeItem('yt-convert-history'); };
  const handleReset = () => { setUrl(''); setPhase('input'); setError(''); setVideoInfo(null); setLaunched(null); setFormat('mp4'); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter' && (phase === 'input' || phase === 'error')) handleGetInfo(); };
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value);
    // Leave the error state as soon as the user starts editing the URL again.
    if (phase === 'error') { setPhase('input'); setError(''); }
  };

  const convList = getConverters();

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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8Z" fill="white"/><path d="m9.75 15.02 5.75-3.02-5.75-3.02v6.04Z" fill="#FF0000"/></svg>
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight">YT Convert</h1>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">YouTube {'\u00B7'} YT Music {'\u00B7'} SoundCloud {'\u00B7'} X {'\u00B7'} Instagram {'\u00B7'} Spotify {'\u00B7'} Deezer {'\u00B7'} Apple Music {'\u00B7'} TikTok {'\u00B7'} Facebook {'\u00B7'} Snapchat {'\u00B7'} BeReal</p>
            </div>
          </div>
          <button onClick={toggleDark} aria-label="Toggle dark mode" className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" title="Toggle dark mode">
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 space-y-5">

        <div className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-800 transition-colors p-5 space-y-4">
          <label htmlFor="url-input" className="text-sm font-semibold">Paste any link</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input id="url-input" type="url" placeholder={placeholders[phIdx]} value={url} onChange={handleUrlChange} onKeyDown={handleKeyDown} disabled={phase === 'loading'} className="w-full pl-10 pr-3 h-11 text-sm rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent placeholder:text-gray-400 dark:text-white" />
            </div>
            {(phase === 'input' || phase === 'error') && (
              <button onClick={handleGetInfo} disabled={!url.trim()} className="h-11 px-5 rounded-xl bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-sm font-semibold shadow-lg shadow-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2">
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
          <div className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-red-200 dark:border-red-900 p-8 text-center space-y-3">
            <div className="w-8 h-8 border-[3px] border-red-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-gray-500">Fetching info...</p>
          </div>
        )}

        {phase === 'ready' && videoInfo && (
          <div>
            <div className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-red-200 dark:border-red-900 overflow-hidden p-5 space-y-4 mb-5">
              {videoInfo.thumbnail && (
                <div className="relative rounded-xl overflow-hidden bg-black group cursor-pointer" onClick={() => window.open(videoId ? 'https://www.youtube.com/watch?v=' + videoId : url.trim(), '_blank')}>
                  <img src={videoInfo.thumbnail} alt={videoInfo.title} className="w-full object-cover" style={{ maxHeight: '360px' }} onError={(e) => { const img = e.currentTarget; if (videoId) img.src = 'https://i.ytimg.com/vi/' + videoId + '/mqdefault.jpg'; else img.style.display = 'none'; }} />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-14 h-14 rounded-full bg-red-600 flex items-center justify-center"><Play className="w-6 h-6 text-white ml-0.5" fill="currentColor" /></div>
                  </div>
                  {videoInfo.duration && <span className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-0.5 rounded">{videoInfo.duration}</span>}
                </div>
              )}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-sm line-clamp-2">{videoInfo.title}</h3>
                  {videoInfo.author && <p className="text-xs text-gray-500 mt-1">{videoInfo.author}</p>}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {videoInfo.views && <span className="text-[11px] text-gray-400">{videoInfo.views} views</span>}
                    {videoInfo.published && <span className="text-[11px] text-gray-400">{videoInfo.published}</span>}
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
                <button onClick={handleReset} className="text-xs text-gray-500 hover:text-red-500 flex items-center gap-1">
                  <ArrowLeft className="w-3 h-3" /> New
                </button>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 space-y-1.5">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">How to download:</p>
                <ol className="text-[11px] text-gray-500 list-decimal list-inside pl-1"><li>Click a converter {'\u2014'} opens in new tab</li><li>Your URL is <strong>auto-copied</strong></li><li>Press Ctrl+V to paste, convert and download</li></ol>
              </div>
              {launched && (
                <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 dark:bg-green-950/30 dark:text-green-400 px-3 py-2 rounded-lg">
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
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm">{svc.name}</span>
                        {svc.recommended && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">BEST</span>}
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5">{svc.desc}</p>
                    </div>
                    <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                      <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-red-500 transition-colors" />
                      <button onClick={(e) => { e.stopPropagation(); toggleFav(svc.name); }} aria-label={svc.name === favorite ? `Remove ${svc.name} from favorites` : `Favorite ${svc.name}`} className="p-0.5">
                        <Star className={'w-3.5 h-3.5 ' + (svc.name === favorite ? 'text-yellow-500' : 'text-gray-300')} fill={svc.name === favorite ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-red-200 dark:border-red-900 p-5 space-y-3">
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
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8Z" fill="white"/><path d="m9.75 15.02 5.75-3.02-5.75-3.02v6.04Z" fill="#FF0000"/></svg>
                </div>
                <span className="text-[11px] font-medium text-gray-500">YouTube</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 group">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-600 to-red-700 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <img src="https://cdn.simpleicons.org/youtubemusic/ffffff" width="24" height="24" alt="YT Music" />
                </div>
                <span className="text-[11px] font-medium text-gray-500">YT Music</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 group">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <img src="https://cdn.simpleicons.org/soundcloud/ffffff" width="24" height="24" alt="SoundCloud" />
                </div>
                <span className="text-[11px] font-medium text-gray-500">SoundCloud</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 group">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-gray-800 to-black flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </div>
                <span className="text-[11px] font-medium text-gray-500">X</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 group">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-500 via-purple-500 to-orange-400 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <img src="https://cdn.simpleicons.org/instagram/ffffff" width="24" height="24" alt="Instagram" />
                </div>
                <span className="text-[11px] font-medium text-gray-500">Instagram</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 group">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
                </div>
                <span className="text-[11px] font-medium text-gray-500">Spotify</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 group">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <img src="https://cdn.simpleicons.org/deezer/ffffff" width="24" height="24" alt="Deezer" />
                </div>
                <span className="text-[11px] font-medium text-gray-500">Deezer</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 group">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-500 to-red-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <img src="https://cdn.simpleicons.org/applemusic/ffffff" width="24" height="24" alt="Apple Music" />
                </div>
                <span className="text-[11px] font-medium text-gray-500">Apple Music</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 group">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-gray-900 to-black flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <img src="https://cdn.simpleicons.org/tiktok/ffffff" width="24" height="24" alt="TikTok" />
                </div>
                <span className="text-[11px] font-medium text-gray-500">TikTok</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 group">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <img src="https://cdn.simpleicons.org/facebook/ffffff" width="24" height="24" alt="Facebook" />
                </div>
                <span className="text-[11px] font-medium text-gray-500">Facebook</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 group">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FFFC00] to-[#E6E200] flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <img src="https://cdn.simpleicons.org/snapchat/000000" width="24" height="24" alt="Snapchat" />
                </div>
                <span className="text-[11px] font-medium text-gray-500">Snapchat</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 group">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-gray-900 to-black flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="BeReal"><text x="50%" y="54%" dominantBaseline="middle" textAnchor="middle" fontFamily="system-ui,sans-serif" fontSize="7" fontWeight="800" fill="white" letterSpacing="-0.2">BeReal.</text></svg>
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
        <p className="text-center text-[11px] text-gray-400">YT Convert {'\u2014'} For personal use only</p>
      </footer>
    </div>
  );
}
