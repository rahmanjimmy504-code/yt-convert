'use client';
import { useState, useCallback, useEffect } from 'react';

type Platform = 'youtube' | 'soundcloud' | 'x' | 'instagram' | 'spotify' | 'unknown';

interface VideoInfo { title: string; thumbnail: string; platform: Platform; }

interface Converter { name: string; url: string; platforms: Platform[]; }

interface HistoryEntry { url: string; title: string; platform: Platform; timestamp: number; }

const PLATFORMS = [
  { id: 'youtube' as Platform, name: 'YouTube', color: '#FF0000' },
  { id: 'soundcloud' as Platform, name: 'SoundCloud', color: '#FF5500' },
  { id: 'x' as Platform, name: 'X', color: '#1DA1F2' },
  { id: 'instagram' as Platform, name: 'Instagram', color: '#E4405F' },
  { id: 'spotify' as Platform, name: 'Spotify', color: '#1DB954' },
];

const CONVERTERS: Converter[] = [
  { name: '9Convert', url: 'https://9convert.org/', platforms: ['youtube', 'soundcloud', 'instagram', 'x'] },
  { name: 'YT1s', url: 'https://yt1s.com', platforms: ['youtube'] },
  { name: 'SaveFrom', url: 'https://savefrom.net', platforms: ['youtube', 'instagram'] },
  { name: 'SnapSave', url: 'https://snapsave.app', platforms: ['youtube', 'instagram'] },
  { name: 'Y2Mate', url: 'https://y2mate.com', platforms: ['youtube'] },
  { name: 'SSSTwitter', url: 'https://ssstwitter.com', platforms: ['x'] },
  { name: 'DownloadGram', url: 'https://downloadgram.com', platforms: ['instagram'] },
];

const TIPS = [
  'Paste any YouTube, SoundCloud, X, Instagram, or Spotify link to get started!',
  'Bookmark your favorite converter for quick access.',
  'Your history is saved locally in your browser.',
  '9Convert is recommended — supports YouTube, SoundCloud, X, and Instagram.',
  'Supports 5 platforms: YouTube, SoundCloud, X, Instagram, and Spotify.',
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
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function sGet(k: string, f: string): string {
  if (typeof window === 'undefined') return f;
  try { return localStorage.getItem(k) || f; } catch { return f; }
}
function sSet(k: string, v: string): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(k, v); } catch {}
}
function sGetJ<T>(k: string, f: T): T {
  if (typeof window === 'undefined') return f;
  try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : f; } catch { return f; }
}
function sSetJ(k: string, v: unknown): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
}

function PIco({ platform, size = 18 }: { platform: Platform; size?: number }) {
  if (platform === 'youtube') return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" fill="#FF0000"/>
      <path d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="white"/>
    </svg>
  );
  if (platform === 'soundcloud') return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path d="M1.175 12.225c-.051 0-.094.046-.101.1l-.233 2.154.233 2.105c.007.058.05.098.101.098.05 0 .09-.04.099-.098l.255-2.105-.27-2.154c-.009-.06-.05-.1-.1-.1zm-.899.828c-.06 0-.091.037-.104.094L0 14.479l.172 1.308c.013.06.045.094.09.094.053 0 .084-.035.098-.094l.199-1.308-.2-1.332c-.014-.057-.045-.094-.083-.094zm1.83-1.229c-.065 0-.108.053-.112.11l-.21 2.563.21 2.458c.004.065.047.11.112.11.063 0 .106-.045.116-.11l.238-2.458-.238-2.563c-.01-.057-.053-.11-.116-.11zm.945-.089c-.075 0-.121.057-.127.125l-.197 2.636.197 2.54c.006.075.052.125.127.125.072 0 .118-.05.13-.125l.223-2.54-.223-2.636c-.012-.068-.058-.125-.13-.125zm1.01-.459c-.084 0-.133.063-.139.138l-.182 3.095.182 2.6c.006.082.055.138.139.138.082 0 .131-.056.143-.138l.207-2.6-.207-3.095c-.012-.075-.061-.138-.143-.138zm.98-.26c-.093 0-.146.068-.15.15l-.17 3.3.17 2.652c.004.09.057.15.15.15.09 0 .143-.06.155-.15l.193-2.652-.193-3.3c-.012-.082-.065-.15-.155-.15zm1.023-.178c-.1 0-.157.075-.162.162l-.155 3.478.155 2.687c.005.1.062.163.162.163.098 0 .155-.063.169-.163l.176-2.687-.176-3.478c-.014-.087-.071-.162-.169-.162zm1.033-.074c-.11 0-.168.082-.172.175l-.142 3.553.142 2.713c.004.107.062.175.172.175.105 0 .165-.068.178-.175l.158-2.713-.158-3.553c-.013-.093-.073-.175-.178-.175zm1.046.03c-.12 0-.182.09-.186.19l-.128 3.46.128 2.727c.004.118.066.19.186.19.116 0 .178-.072.192-.19l.144-2.727-.144-3.46c-.014-.1-.076-.19-.192-.19zm4.653.926c-.282 0-.549.062-.79.174a4.27 4.27 0 0 0-3.988-2.724c-.198 0-.396.012-.588.046-.1.018-.15.074-.152.162l-.136 3.423.136 2.738c.006.1.06.15.15.15h.014c1.596-.01 3.05.66 4.09 1.733.13.133.26.2.412.2h5.16c.24 0 .437-.197.437-.437V15.58c0-1.635-1.325-2.966-2.955-2.966z" fill="#FF5500"/>
    </svg>
  );
  if (platform === 'x') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  );
  if (platform === 'instagram') return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <rect x="2" y="2" width="20" height="20" rx="5" stroke="#E4405F" strokeWidth="2" fill="none"/>
      <circle cx="12" cy="12" r="5" stroke="#E4405F" strokeWidth="2" fill="none"/>
      <circle cx="17.5" cy="6.5" r="1.5" fill="#E4405F"/>
    </svg>
  );
  if (platform === 'spotify') return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" fill="#1DB954"/>
    </svg>
  );
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
    const savedDark = sGet('yt-convert-dark', 'false');
    const isDark = savedDark === 'true';
    setDarkMode(isDark);
    if (isDark) document.documentElement.classList.add('dark');
    setHistory(sGetJ<HistoryEntry[]>('yt-convert-history', []));
    setFavoriteConverter(sGet('yt-convert-fav', null));
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const i = setInterval(() => setTipIndex(t => (t + 1) % TIPS.length), 5000);
    return () => clearInterval(i);
  }, [mounted]);

  const toggleDark = useCallback(() => {
    setDarkMode(p => {
      const n = !p;
      sSet('yt-convert-dark', String(n));
      if (n) document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
      return n;
    });
  }, []);

  const addHist = useCallback((e: HistoryEntry) => {
    setHistory(p => { const f = p.filter(h => h.url !== e.url); const u = [e, ...f].slice(0, 20); sSetJ('yt-convert-history', u); return u; });
  }, []);

  const analyze = useCallback(async () => {
    if (!url.trim()) { setError('Please enter a URL'); return; }
    const pl = detectPlatform(url);
    if (pl === 'unknown') { setError('Unsupported platform.'); return; }
    setLoading(true); setError(''); setVideoInfo(null);
    try {
      const r = await fetch(`/api/video-info?url=${encodeURIComponent(url)}`);
      if (!r.ok) throw new Error();
      const d = await r.json();
      const info: VideoInfo = { title: d.title || 'Untitled', thumbnail: d.thumbnail || '', platform: pl };
      if (!info.thumbnail && pl === 'youtube') { const id = getYouTubeId(url); if (id) info.thumbnail = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`; }
      setVideoInfo(info);
      addHist({ url, title: info.title, platform: pl, timestamp: Date.now() });
    } catch {
      setError('Could not fetch info. Use a converter below.');
      setVideoInfo({ title: 'Could not load title', thumbnail: '', platform: pl });
    } finally { setLoading(false); }
  }, [url, addHist]);

  const setFav = useCallback((n: string) => {
    setFavoriteConverter(p => { const x = p === n ? null : n; sSet('yt-convert-fav', x || ''); return x; });
  }, []);

  const clearHist = useCallback(() => { setHistory([]); sSetJ('yt-convert-history', []); }, []);

  const filtered = CONVERTERS.filter(c => {
    if (!videoInfo) return activePlatform === 'all' || c.platforms.includes(activePlatform as Platform);
    return c.platforms.includes(videoInfo.platform);
  });

  const sorted = (() => {
    const f = filtered.find(c => c.name === favoriteConverter);
    const r = filtered.filter(c => c.name !== favoriteConverter);
    return f ? [f, ...r] : r;
  })();

  const dk = darkMode;
  if (!mounted) return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950"><div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin"/></div>;

  return (
    <div className={`min-h-screen ${dk ? 'bg-[#0a0a0a] text-gray-100' : 'bg-[#f8f8f8] text-gray-900'}`}>

      {/* NAVBAR */}
      <nav className={`border-b ${dk ? 'border-white/10 bg-[#0a0a0a]' : 'border-gray-200 bg-white'} sticky top-0 z-50`}>
        <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24"><polygon points="6,3 20,12 6,21" fill="white"/></svg>
            </div>
            <span className="text-lg font-bold">YT Convert</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowHistory(!showHistory)} className={`text-xs px-3 py-1.5 rounded-md ${dk ? 'bg-white/5 hover:bg-white/10 text-gray-400' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'} transition-colors`}>
              History {history.length > 0 && `(${history.length})`}
            </button>
            <button onClick={toggleDark} className={`p-2 rounded-lg ${dk ? 'bg-white/5 hover:bg-white/10 text-gray-400' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'} transition-colors`}>
              {dk ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              )}
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-5 py-10 space-y-10">

        {/* HERO INPUT */}
        <div className="text-center space-y-6">
          <h2 className={`text-3xl font-bold tracking-tight ${dk ? 'text-white' : 'text-gray-900'}`}>Convert any link, instantly</h2>
          <p className={`text-sm ${dk ? 'text-gray-500' : 'text-gray-400'}`}>{TIPS[tipIndex]}</p>
          <div className="flex gap-2 max-w-xl mx-auto">
            <input type="url" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && analyze()} placeholder="Paste a link here..." className={`flex-1 px-4 py-3 rounded-xl text-sm outline-none border transition-all ${dk ? 'bg-white/5 border-white/10 text-white placeholder-gray-600 focus:border-red-500/50' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-red-400'}`}/>
            <button onClick={analyze} disabled={loading} className="px-5 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2">
              {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/> : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              Go
            </button>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}

          {/* Platform pills */}
          <div className="flex flex-wrap justify-center gap-2">
            {PLATFORMS.map(p => (
              <button key={p.id} onClick={() => setActivePlatform(activePlatform === p.id ? 'all' : p.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${activePlatform === p.id ? (dk ? 'border-white/20 bg-white/10 text-white' : 'border-gray-300 bg-gray-900 text-white') : (dk ? 'border-white/5 bg-white/[0.02] text-gray-500 hover:bg-white/5' : 'border-gray-100 bg-white text-gray-500 hover:bg-gray-50')}`}>
                <PIco platform={p.id} size={12}/>{p.name}
              </button>
            ))}
          </div>
        </div>

        {/* VIDEO PREVIEW */}
        {videoInfo && (
          <div className={`rounded-2xl overflow-hidden border ${dk ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-white'}`}>
            <div className="flex">
              {videoInfo.thumbnail ? (
                <div className="relative w-40 sm:w-56 flex-shrink-0 bg-black">
                  <img src={videoInfo.thumbnail} alt="" className="w-full h-full object-cover" onError={e => { const id = getYouTubeId(url); if (id) (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${id}/mqdefault.jpg`; }}/>
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center">
                      <svg width="18" height="18" viewBox="0 0 24 24"><polygon points="8,5 20,12 8,19" fill="white"/></svg>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-40 sm:w-56 flex-shrink-0 bg-white/5 flex items-center justify-center"><PIco platform={videoInfo.platform} size={40}/></div>
              )}
              <div className="p-4 flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md" style={{ backgroundColor: PLATFORMS.find(x => x.id === videoInfo.platform)?.color + '18', color: PLATFORMS.find(x => x.id === videoInfo.platform)?.color }}>
                    {PLATFORMS.find(x => x.id === videoInfo.platform)?.name}
                  </span>
                </div>
                <h3 className="font-semibold text-sm leading-snug line-clamp-2">{videoInfo.title}</h3>
                <p className={`text-xs mt-2 truncate ${dk ? 'text-gray-600' : 'text-gray-400'}`}>{url.length > 50 ? url.slice(0, 50) + '...' : url}</p>
              </div>
            </div>
          </div>
        )}

        {/* CONVERTERS */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500">{videoInfo ? `Convert with` : 'All Converters'}</h3>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-gray-500">Favorite:</span>
              <select value={favoriteConverter || ''} onChange={e => setFav(e.target.value)} className={`text-xs border-0 bg-transparent outline-none cursor-pointer ${dk ? 'text-gray-300' : 'text-gray-700'}`}>
                <option value="">None</option>
                {CONVERTERS.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            {sorted.map(conv => (
              <a key={conv.name} href={videoInfo ? `${conv.url}?url=${encodeURIComponent(url)}` : conv.url} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-3 p-3 rounded-xl border transition-all hover:shadow-lg group ${dk ? 'border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/5' : 'border-gray-100 bg-white hover:border-red-200 hover:shadow-red-100'}`}>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${dk ? 'bg-red-600/20' : 'bg-red-50'}`}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={dk ? '#f87171' : '#ef4444'} strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{conv.name}</p>
                  <div className="flex gap-1.5 mt-0.5">{conv.platforms.map(p => <PIco key={p} platform={p} size={11}/>)}</div>
                </div>
                {favoriteConverter === conv.name && <svg width="14" height="14" viewBox="0 0 24 24" fill="#EAB308" stroke="#EAB308" strokeWidth="2"><polygon points="12,2 15,8 22,9 17,14 18,21 12,18 6,21 7,14 2,9 9,8"/></svg>}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={dk ? '#555' : '#ccc'} strokeWidth="2" className="group-hover:translate-x-0.5 transition-transform"><polyline points="9,18 15,12 9,6"/></svg>
              </a>
            ))}
          </div>
        </div>

        {/* HISTORY PANEL */}
        {showHistory && (
          <div className={`rounded-2xl border p-5 ${dk ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-white'}`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500">History</h3>
              {history.length > 0 && <button onClick={clearHist} className="text-xs text-red-500">Clear all</button>}
            </div>
            {history.length === 0 ? (
              <p className={`text-sm ${dk ? 'text-gray-600' : 'text-gray-400'}`}>No conversions yet</p>
            ) : (
              <div className="space-y-3">
                {history.map((h, i) => (
                  <div key={i} className="flex items-start gap-3 text-sm group">
                    <PIco platform={h.platform} size={14}/>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-sm">{h.title}</p>
                      <p className={`text-xs ${dk ? 'text-gray-600' : 'text-gray-400'}`}>{new Date(h.timestamp).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* FOOTER */}
      <footer className={`border-t mt-8 py-5 text-center text-xs ${dk ? 'border-white/5 text-gray-600' : 'border-gray-100 text-gray-400'}`}>
        YT Convert — YouTube, SoundCloud, X, Instagram & Spotify
      </footer>
    </div>
  );
}
