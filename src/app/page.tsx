'use client';
import { useState, useCallback, useEffect } from 'react';

type Platform = 'youtube' | 'soundcloud' | 'x' | 'instagram' | 'spotify' | 'unknown';

interface VideoInfo {
  title: string;
  thumbnail: string;
  platform: Platform;
}

interface Converter {
  name: string;
  url: string;
  platforms: Platform[];
}

interface HistoryEntry {
  url: string;
  title: string;
  platform: Platform;
  timestamp: number;
}

const PLATFORMS = [
  { id: 'youtube' as Platform, name: 'YouTube', color: '#FF0000' },
  { id: 'soundcloud' as Platform, name: 'SoundCloud', color: '#FF5500' },
  { id: 'x' as Platform, name: 'X', color: '#000000' },
  { id: 'instagram' as Platform, name: 'Instagram', color: '#E4405F' },
  { id: 'spotify' as Platform, name: 'Spotify', color: '#1DB954' },
];

const CONVERTERS: Converter[] = [
  { name: '9converter', url: 'https://9converter.org', platforms: ['youtube', 'soundcloud', 'instagram', 'x'] },
  { name: 'YT1s', url: 'https://yt1s.com', platforms: ['youtube'] },
  { name: 'SaveFrom', url: 'https://savefrom.net', platforms: ['youtube', 'instagram'] },
  { name: 'SnapSave', url: 'https://snapsave.app', platforms: ['youtube', 'instagram'] },
  { name: 'Y2Mate', url: 'https://y2mate.com', platforms: ['youtube'] },
  { name: 'SSSTwitter', url: 'https://ssstwitter.com', platforms: ['x'] },
  { name: 'DownloadGram', url: 'https://downloadgram.com', platforms: ['instagram'] },
];

const TIPS = [
  'Paste any YouTube, SoundCloud, X, Instagram, or Spotify link to get started!',
  'Bookmark your favorite converter for quick access next time.',
  'Your conversion history is saved locally in your browser.',
  '9converter is recommended — supports YouTube, SoundCloud, X, and Instagram.',
  'Supports 5 platforms: YouTube, SoundCloud, X (Twitter), Instagram, and Spotify.',
];

function detectPlatform(url: string): Platform {
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
  if (/soundcloud\.com/i.test(url)) return 'soundcloud';
  if (/x\.com|twitter\.com/i.test(url)) return 'x';
  if (/instagram\.com/i.test(url)) return 'instagram';
  if (/spotify\.com|open\.spotify/i.test(url)) return 'spotify';
  return 'unknown';
}

function getYouTubeId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

function safeGetItem(key: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}

function safeSetItem(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(key, value); } catch {}
}

function safeGetJSON<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}

function safeSetJSON(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function PlatformIcon({ platform, size = 18 }: { platform: Platform; size?: number }) {
  if (platform === 'youtube') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" fill="#FF0000" />
        <path d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="white" />
      </svg>
    );
  }
  if (platform === 'soundcloud') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24">
        <path d="M1.175 12.225c-.051 0-.094.046-.101.1l-.233 2.154.233 2.105c.007.058.05.098.101.098.05 0 .09-.04.099-.098l.255-2.105-.27-2.154c-.009-.06-.05-.1-.1-.1zm-.899.828c-.06 0-.091.037-.104.094L0 14.479l.172 1.308c.013.06.045.094.09.094.053 0 .084-.035.098-.094l.199-1.308-.2-1.332c-.014-.057-.045-.094-.083-.094zm1.83-1.229c-.065 0-.108.053-.112.11l-.21 2.563.21 2.458c.004.065.047.11.112.11.063 0 .106-.045.116-.11l.238-2.458-.238-2.563c-.01-.057-.053-.11-.116-.11zm.945-.089c-.075 0-.121.057-.127.125l-.197 2.636.197 2.54c.006.075.052.125.127.125.072 0 .118-.05.13-.125l.223-2.54-.223-2.636c-.012-.068-.058-.125-.13-.125zm1.01-.459c-.084 0-.133.063-.139.138l-.182 3.095.182 2.6c.006.082.055.138.139.138.082 0 .131-.056.143-.138l.207-2.6-.207-3.095c-.012-.075-.061-.138-.143-.138zm.98-.26c-.093 0-.146.068-.15.15l-.17 3.3.17 2.652c.004.09.057.15.15.15.09 0 .143-.06.155-.15l.193-2.652-.193-3.3c-.012-.082-.065-.15-.155-.15zm1.023-.178c-.1 0-.157.075-.162.162l-.155 3.478.155 2.687c.005.1.062.163.162.163.098 0 .155-.063.169-.163l.176-2.687-.176-3.478c-.014-.087-.071-.162-.169-.162zm1.033-.074c-.11 0-.168.082-.172.175l-.142 3.553.142 2.713c.004.107.062.175.172.175.105 0 .165-.068.178-.175l.158-2.713-.158-3.553c-.013-.093-.073-.175-.178-.175zm1.046.03c-.12 0-.182.09-.186.19l-.128 3.46.128 2.727c.004.118.066.19.186.19.116 0 .178-.072.192-.19l.144-2.727-.144-3.46c-.014-.1-.076-.19-.192-.19zm4.653.926c-.282 0-.549.062-.79.174a4.27 4.27 0 0 0-3.988-2.724c-.198 0-.396.012-.588.046-.1.018-.15.074-.152.162l-.136 3.423.136 2.738c.006.1.06.15.15.15h.014c1.596-.01 3.05.66 4.09 1.733.13.133.26.2.412.2h5.16c.24 0 .437-.197.437-.437V15.58c0-1.635-1.325-2.966-2.955-2.966z" fill="#FF5500" />
      </svg>
    );
  }
  if (platform === 'x') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    );
  }
  if (platform === 'instagram') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24">
        <rect x="2" y="2" width="20" height="20" rx="5" stroke="#E4405F" strokeWidth="2" fill="none" />
        <circle cx="12" cy="12" r="5" stroke="#E4405F" strokeWidth="2" fill="none" />
        <circle cx="17.5" cy="6.5" r="1.5" fill="#E4405F" />
      </svg>
    );
  }
  if (platform === 'spotify') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24">
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" fill="#1DB954" />
      </svg>
    );
  }
  return null;
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [favoriteConverter, setFavoriteConverter] = useState<string | null>(null);
  const [tipIndex, setTipIndex] = useState(0);
  const [activePlatform, setActivePlatform] = useState<Platform | 'all'>('all');
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    setMounted(true);
    const savedDark = safeGetItem('yt-convert-dark', 'false');
    const isDark = savedDark === 'true';
    setDarkMode(isDark);
    if (isDark) document.documentElement.classList.add('dark');
    setHistory(safeGetJSON<HistoryEntry[]>('yt-convert-history', []));
    setFavoriteConverter(safeGetItem('yt-convert-fav', null));
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const interval = setInterval(() => {
      setTipIndex(prev => (prev + 1) % TIPS.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [mounted]);

  const toggleDarkMode = useCallback(() => {
    setDarkMode(prev => {
      const next = !prev;
      safeSetItem('yt-convert-dark', String(next));
      if (next) document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
      return next;
    });
  }, []);

  const addToHistory = useCallback((entry: HistoryEntry) => {
    setHistory(prev => {
      const filtered = prev.filter(h => h.url !== entry.url);
      const updated = [entry, ...filtered].slice(0, 20);
      safeSetJSON('yt-convert-history', updated);
      return updated;
    });
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!url.trim()) { setError('Please enter a URL'); return; }
    const platform = detectPlatform(url);
    if (platform === 'unknown') { setError('Unsupported platform. Try YouTube, SoundCloud, X, Instagram, or Spotify.'); return; }
    setLoading(true); setError(''); setVideoInfo(null);
    try {
      const res = await fetch(`/api/video-info?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const info: VideoInfo = { title: data.title || 'Untitled', thumbnail: data.thumbnail || '', platform };
      if (!info.thumbnail && platform === 'youtube') {
        const ytId = getYouTubeId(url);
        if (ytId) info.thumbnail = `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
      }
      setVideoInfo(info);
      addToHistory({ url, title: info.title, platform, timestamp: Date.now() });
    } catch {
      setError('Could not fetch info. Try again or use a converter directly.');
      setVideoInfo({ title: 'Could not load title', thumbnail: '', platform });
    } finally { setLoading(false); }
  }, [url, addToHistory]);

  const setFavorite = useCallback((name: string) => {
    setFavoriteConverter(prev => {
      const next = prev === name ? null : name;
      safeSetItem('yt-convert-fav', next || '');
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    safeSetJSON('yt-convert-history', []);
  }, []);

  const filteredConverters = CONVERTERS.filter(c => {
    if (!videoInfo) return activePlatform === 'all' || c.platforms.includes(activePlatform as Platform);
    return c.platforms.includes(videoInfo.platform);
  });

  const sortedConverters = (() => {
    const fav = filteredConverters.find(c => c.name === favoriteConverter);
    const rest = filteredConverters.filter(c => c.name !== favoriteConverter);
    return fav ? [fav, ...rest] : rest;
  })();

  const bgColor = darkMode ? 'bg-gray-950 text-gray-100' : 'bg-gray-50 text-gray-900';
  const cardBg = darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200';
  const inputBg = darkMode ? 'bg-gray-800 border-gray-700 text-gray-100 placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400';
  const mutedText = darkMode ? 'text-gray-400' : 'text-gray-500';
  const secondaryBtn = darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-800';

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors duration-300 ${bgColor}`}>
      <header className={`border-b ${darkMode ? 'border-gray-800' : 'border-gray-200'} sticky top-0 z-50 ${darkMode ? 'bg-gray-950/95' : 'bg-white/95'} backdrop-blur-sm`}>
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-red-600 rounded-lg flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24"><polygon points="6,3 20,12 6,21" fill="white" /></svg>
            </div>
            <h1 className="text-xl font-bold tracking-tight">YT Convert</h1>
          </div>
          <button onClick={toggleDarkMode} className={`p-2 rounded-lg transition-colors ${secondaryBtn}`} aria-label="Toggle dark mode">
            {darkMode ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
            )}
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <div className="flex flex-wrap items-center justify-center gap-3">
          {PLATFORMS.map(p => (
            <button key={p.id} onClick={() => setActivePlatform(activePlatform === p.id ? 'all' : p.id)} className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition-all ${activePlatform === p.id ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400' : `${cardBg} border hover:border-red-300`}`}>
              <PlatformIcon platform={p.id} size={18} />
              {p.name}
            </button>
          ))}
        </div>

        <div className={`rounded-2xl border p-6 ${cardBg} shadow-sm`}>
          <div className="flex flex-col sm:flex-row gap-3">
            <input type="url" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAnalyze()} placeholder="Paste YouTube, SoundCloud, X, Instagram, or Spotify link..." className={`flex-1 px-4 py-3 rounded-xl border text-base outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all ${inputBg}`} />
            <button onClick={handleAnalyze} disabled={loading} className="px-6 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>}
              {loading ? 'Analyzing...' : 'Convert'}
            </button>
          </div>
          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
          <p className={`mt-3 text-xs ${mutedText} text-center transition-opacity duration-500`}>{TIPS[tipIndex]}</p>
        </div>

        {videoInfo && (
          <div className={`rounded-2xl border overflow-hidden ${cardBg} shadow-sm`}>
            <div className="flex flex-col sm:flex-row">
              {videoInfo.thumbnail ? (
                <div className="relative sm:w-64 w-full h-44 sm:h-auto flex-shrink-0 bg-gray-900">
                  <img src={videoInfo.thumbnail} alt="" className="w-full h-full object-cover" onError={e => { const id = getYouTubeId(url); if (id) (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${id}/mqdefault.jpg`; }} />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <div className="w-14 h-14 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
                      <svg width="24" height="24" viewBox="0 0 24 24"><polygon points="9,7 17,12 9,17" fill="#FF0000" /></svg>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="sm:w-64 w-full h-44 sm:h-auto flex-shrink-0 bg-gray-800 flex items-center justify-center">
                  <PlatformIcon platform={videoInfo.platform} size={48} />
                </div>
              )}
              <div className="p-5 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <PlatformIcon platform={videoInfo.platform} size={20} />
                    <span className="text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ backgroundColor: PLATFORMS.find(x => x.id === videoInfo.platform)?.color + '20', color: PLATFORMS.find(x => x.id === videoInfo.platform)?.color }}>
                      {PLATFORMS.find(x => x.id === videoInfo.platform)?.name}
                    </span>
                  </div>
                  <h2 className="text-lg font-semibold leading-snug">{videoInfo.title}</h2>
                </div>
                <div className="mt-4 text-xs text-gray-500 truncate">{url.length > 60 ? url.slice(0, 60) + '...' : url}</div>
              </div>
            </div>
          </div>
        )}

        <div>
          <h3 className={`text-lg font-semibold mb-4 ${mutedText}`}>{videoInfo ? `Converters for ${PLATFORMS.find(x => x.id === videoInfo.platform)?.name}` : 'All Converters'}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {sortedConverters.map(conv => (
              <a key={conv.name} href={videoInfo ? `${conv.url}?url=${encodeURIComponent(url)}` : conv.url} target="_blank" rel="noopener noreferrer" className={`flex items-center justify-between p-4 rounded-xl border transition-all hover:shadow-md hover:border-red-400 hover:-translate-y-0.5 ${cardBg}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{conv.name}</p>
                    <div className="flex gap-1.5 mt-0.5">{conv.platforms.map(p => <PlatformIcon key={p} platform={p} size={12} />)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                  {favoriteConverter === conv.name && <svg width="16" height="16" viewBox="0 0 24 24" fill="#EAB308" stroke="#EAB308" strokeWidth="2"><polygon points="12,2 15,8 22,9 17,14 18,21 12,18 6,21 7,14 2,9 9,8" /></svg>}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={mutedText}><polyline points="9,18 15,12 9,6" /></svg>
                </div>
              </a>
            ))}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className={`rounded-xl border p-5 ${cardBg}`}>
            <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#EAB308" stroke="#EAB308" strokeWidth="2"><polygon points="12,2 15,8 22,9 17,14 18,21 12,18 6,21 7,14 2,9 9,8" /></svg>
              Favorite Converter
            </h4>
            <select value={favoriteConverter || ''} onChange={e => setFavorite(e.target.value)} className={`w-full px-3 py-2 rounded-lg border text-sm ${inputBg}`}>
              <option value="">None selected</option>
              {CONVERTERS.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
            {favoriteConverter && <p className={`mt-2 text-xs ${mutedText}`}>★ {favoriteConverter} will always appear first</p>}
          </div>

          <div className={`rounded-xl border p-5 ${cardBg}`}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><polyline points="12,6 12,12 16,14" /></svg>
                History
                {history.length > 0 && <span className="text-xs font-normal text-gray-400">({history.length})</span>}
              </h4>
              {history.length > 0 && <button onClick={clearHistory} className="text-xs text-red-500 hover:text-red-600">Clear</button>}
            </div>
            {history.length === 0 ? (
              <p className={`text-xs ${mutedText}`}>No conversions yet</p>
            ) : !showHistory ? (
              <button onClick={() => setShowHistory(true)} className="text-xs text-red-500 hover:text-red-600">Show history ({history.length})</button>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {history.map((h, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <PlatformIcon platform={h.platform} size={12} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{h.title}</p>
                      <p className={mutedText}>{new Date(h.timestamp).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className={`border-t mt-12 py-6 text-center text-xs ${mutedText} ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
        <p>YT Convert — Convert from YouTube, SoundCloud, X, Instagram &amp; Spotify</p>
      </footer>
    </div>
  );
}
