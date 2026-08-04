'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

const sGet = (k: string) => (typeof window === 'undefined' ? '' : localStorage.getItem(k) || '');
const sSet = (k: string, v: string) => { if (typeof window !== 'undefined') localStorage.setItem(k, v) };
const sGetJ = (k: string) => { try { return typeof window === 'undefined' ? null : JSON.parse(localStorage.getItem(k) || 'null') } catch { return null } };
const sSetJ = (k: string, v: any) => { if (typeof window !== 'undefined') localStorage.setItem(k, JSON.stringify(v)) };

function getPlatform(u: string) {
  if (!/^https?:\/\//i.test(u) && !/^\w+\.\w{2,}/i.test(u)) return null;
  if (/music\.youtube\.com/i.test(u)) return 'youtubemusic';
  if (/youtu\.?be|youtube\.com/i.test(u)) return 'youtube';
  if (/soundcloud\.com/i.test(u)) return 'soundcloud';
  if (/twitter\.com|x\.com/i.test(u)) return 'twitter';
  if (/instagram\.com/i.test(u)) return 'instagram';
  if (/spotify\.com|open\.spotify\.com/i.test(u)) return 'spotify';
  if (/deezer\.com/i.test(u)) return 'deezer';
  if (/facebook\.com|fb\.watch/i.test(u)) return 'facebook';
  if (/tiktok\.com/i.test(u)) return 'tiktok';
  if (/music\.apple\.com/i.test(u)) return 'applemusic';
  if (/bereal\.com/i.test(u)) return 'br';
  return null;
}
function extractVideoId(url: string) {
  const m = url.match(/(?:v=|youtu\.be\/|shorts\/|live\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}
function pLabel(p: string) { return ({ youtube: 'YouTube', youtubemusic: 'YT Music', soundcloud: 'SoundCloud', twitter: 'X', instagram: 'Instagram', spotify: 'Spotify', deezer: 'Deezer', applemusic: 'Apple Music', tiktok: 'TikTok', facebook: 'Facebook', br: 'BeReal' } as any)[p] || ''; }
function pColor(p: string) {
        return ({ youtube: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', youtubemusic: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', soundcloud: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', twitter: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400', instagram: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400', spotify: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', deezer: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', applemusic: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', tiktok: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', facebook: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', br: 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900', } as any)[p] || 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
}

const tips = ['Paste any link from YouTube, Spotify, SoundCloud, X, Instagram, Deezer, Apple Music, TikTok, Facebook or BeReal.', 'Your URL is auto-copied when you pick a converter.', 'If one converter has ads, try another.', 'All converters are free, no sign-up needed.', 'Press Enter after pasting to fetch info instantly.'];
const placeholders = ['https://www.youtube.com/watch?v=...', 'https://open.spotify.com/track/...', 'https://soundcloud.com/...', 'https://x.com/user/status/...', 'https://www.instagram.com/reel/...', 'https://music.apple.com/...', 'https://www.deezer.com/track/...', 'https://music.youtube.com/watch?v=...', 'https://www.tiktok.com/...', 'https://www.facebook.com/...', 'https://bereal.com/...'];

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState('video');
  const [phase, setPhase] = useState('input');
  const [error, setError] = useState('');
  const [videoInfo, setVideoInfo] = useState<any>(null);
  const [launched, setLaunched] = useState<string | null>(null);
  const [tipIdx, setTipIdx] = useState(0);
  const [dark, setDark] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [favorite, setFavorite] = useState('');
  const [phIdx, setPhIdx] = useState(0);
  const convertersRef = useRef<HTMLDivElement>(null);
  const autoTimer = useRef<any>(null);

  useEffect(() => {
    setMounted(true);
    const s = sGet('yt-convert-dark');
    const d = s !== '' ? s === '1' : window.matchMedia('(prefers-color-scheme:dark)').matches;
    setDark(d);
    document.documentElement.classList.toggle('dark', d);
    setHistory(sGetJ('yt-convert-history') || []);
    setFavorite(sGet('yt-convert-fav'));
    const f = sGet('yt-convert-format');
    if (f === 'audio' || f === 'video') setFormat(f);
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

  const dp = url.trim() ? getPlatform(url.trim()) : null;

  const handleGetInfo = useCallback(async () => {
    if (!url.trim()) return;
    const plat = getPlatform(url.trim());
    if (!plat) { setError('Unsupported URL.'); setPhase('error'); return; }
    setError(''); setPhase('loading'); setVideoInfo(null); setLaunched(null);
    try {
      const r = await fetch('/api/video-info?url=' + encodeURIComponent(url.trim()));
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error((d as any).error || 'Failed'); }
      const data = await r.json();
      const vid = extractVideoId(url.trim());
      setVideoInfo({ title: data.title || 'Unknown', author: data.author || '', thumbnail: data.thumbnail || (plat === 'youtube' && vid ? 'https://i.ytimg.com/vi/' + vid + '/hqdefault.jpg' : ''), duration: data.duration || '', views: data.views || '', published: data.published || '', platform: data.platform || plat });
      setHistory(prev => {
        const h = [{ title: data.title || 'Unknown', url: url.trim(), platform: plat, time: Date.now() }, ...prev.filter((x: any) => x.url !== url.trim())].slice(0, 6);
        sSetJ('yt-convert-history', h);
        return h;
      });
      setPhase('ready');
      setTimeout(() => convertersRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (e: any) {
      setVideoInfo({ title: 'Could not load info', author: '', thumbnail: '', duration: '', views: '', published: '', platform: plat });
      setPhase('ready');
      setTimeout(() => convertersRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
  }, [url]);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) { setUrl(text); setPhase('input'); setError(''); setVideoInfo(null); }
    } catch {}
  }, []);

  useEffect(() => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    if (phase === 'input' || phase === 'error') {
      const plat = getPlatform(url.trim());
            if (plat && url.trim().length > 15 && /^https?:\/\//i.test(url.trim())) {
        autoTimer.current = setTimeout(() => { if (phase === 'input') handleGetInfo(); }, 800);
      }
    }
    return () => { if (autoTimer.current) clearTimeout(autoTimer.current); };
  }, [url]);

  const handleFormatChange = useCallback((f: string) => {
    setFormat(f);
    sSet('yt-convert-format', f);
  }, []);

  const videoId = videoInfo ? extractVideoId(url.trim()) : null;

  const all = [
    { name: '9Convert', url: 'https://9convert.org/', desc: 'YouTube to MP3 and MP4. Fast and reliable.', color: 'from-rose-500 to-rose-600', platform: ['youtube', 'youtubemusic'], recommended: true },
    { name: 'Y2Mate', url: 'https://v27.www-y2mate.com/', desc: 'MP4 (144p-1080p) and MP3 (128-320kbps).', color: 'from-orange-500 to-orange-600', platform: ['youtube', 'youtubemusic'] },
    { name: 'AudioConverter', url: 'https://audioconverter.ai/youtube-to-mp4-converter', desc: 'YouTube to MP4. HD and 4K.', color: 'from-sky-500 to-sky-600', platform: ['youtube', 'youtubemusic'] },
    { name: 'Hicoo', url: 'https://hicoo.ai/mp4-converter/youtube-to-mp4', desc: 'YouTube to MP4. 360p to 4K.', color: 'from-emerald-500 to-emerald-600', platform: ['youtube', 'youtubemusic'] },
    { name: 'KlickAud', url: 'https://www.klickaud.co/', desc: 'SoundCloud to MP3.', color: 'from-orange-400 to-orange-500', platform: ['soundcloud'], recommended: true },
    { name: 'SSSTik', url: 'https://ssstik.io/', desc: 'X/Twitter video downloader.', color: 'from-sky-400 to-sky-500', platform: ['twitter'], recommended: true },
    { name: 'Twitsave', url: 'https://twitsave.com/', desc: 'Save X/Twitter videos in HD.', color: 'from-indigo-500 to-indigo-600', platform: ['twitter'] },
    { name: 'SaveInsta', url: 'https://www.saveinsta.app/', desc: 'Instagram photos and videos.', color: 'from-pink-400 to-pink-500', platform: ['instagram'], recommended: true },
    { name: 'iGram', url: 'https://igram.io/', desc: 'Instagram reels and stories.', color: 'from-purple-500 to-purple-600', platform: ['instagram'] },
    { name: 'SpotDown', url: 'https://spotdown.org/', desc: 'Spotify tracks to MP3.', color: 'from-green-500 to-green-600', platform: ['spotify'], recommended: true },
    { name: 'DeezLoad', url: 'https://deezerdownloader.net/', desc: 'Deezer tracks to MP3.', color: 'from-purple-500 to-purple-600', platform: ['deezer'], recommended: true },
    { name: 'AM Downloader', url: 'https://apple-music-downloader.com/', desc: 'Apple Music to MP3.', color: 'from-gray-600 to-gray-800', platform: ['applemusic'], recommended: true },
    { name: 'TTSave', url: 'https://ttsave.app/', desc: 'TikTok videos without watermark.', color: 'from-pink-500 to-pink-600', platform: ['tiktok'], recommended: true },
    { name: 'SnapTik', url: 'https://snaptik.app/', desc: 'TikTok to MP4, no watermark.', color: 'from-cyan-500 to-cyan-600', platform: ['tiktok'] },
    { name: 'FBDown', url: 'https://fbdown.net/', desc: 'Facebook videos in HD.', color: 'from-blue-600 to-blue-700', platform: ['facebook'], recommended: true },
    { name: 'BeReal Saver', url: 'https://berealsaver.com/', desc: 'Download BeReal photos and videos.', color: 'from-gray-900 to-black', platform: ['br'] },
];
  const getConverters = useCallback(() => {
    const plat = videoInfo?.platform || getPlatform(url.trim());
    if (!plat) return all.slice(0, 4);
    return all.filter(c => c.platform.includes(plat)).sort((a, b) => { if (a.name === favorite) return -1; if (b.name === favorite) return 1; if (a.recommended && !b.recommended) return -1; return 0; });
  }, [videoInfo, url, favorite]);

  const openConverter = (c: any) => { navigator.clipboard.writeText(url.trim()).catch(() => {}); setLaunched(c.name); window.open(c.url, '_blank', 'noopener'); };
  const toggleFav = (n: string) => { const v = favorite === n ? '' : n; setFavorite(v); sSet('yt-convert-fav', v); };
  const clearHist = () => { setHistory([]); if (typeof window !== 'undefined') localStorage.removeItem('yt-convert-history'); };
      const handleReset = () => { setUrl(''); setPhase('input'); setError(''); setVideoInfo(null); setLaunched(null); setFormat('video'); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const handleKeyDown = (e: any) => { if (e.key === 'Enter' && (phase === 'input' || phase === 'error')) handleGetInfo(); };

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
              <p className="text-[11px] text-gray-500 dark:text-gray-400">YouTube {'\u00B7'} YT Music {'\u00B7'} SoundCloud {'\u00B7'} X {'\u00B7'} Instagram {'\u00B7'} Spotify {'\u00B7'} Deezer {'\u00B7'} Apple Music {'\u00B7'} TikTok {'\u00B7'} Facebook {'\u00B7'} BeReal</p>
            </div>
          </div>
          <button onClick={toggleDark} className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" title="Toggle dark mode">
            {dark ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            )}
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 space-y-5">

        <div className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-800 transition-colors p-5 space-y-4">
          <label htmlFor="url-input" className="text-sm font-semibold">Paste any link</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              <input id="url-input" type="url" placeholder={placeholders[phIdx]} value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={handleKeyDown} disabled={phase === 'loading'} className="w-full pl-10 pr-3 h-11 text-sm rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent placeholder:text-gray-400 dark:text-white" />
            </div>
            {(phase === 'input' || phase === 'error') && (
              <button onClick={handleGetInfo} disabled={!url.trim() || phase === 'loading'} className="h-11 px-5 rounded-xl bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-sm font-semibold shadow-lg shadow-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2">
                Go <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {(phase === 'input' || phase === 'error') && (
              <button onClick={handlePaste} className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1 transition-colors">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Paste from clipboard
              </button>
            )}
            {dp && phase === 'input' && <span className={'text-xs font-medium px-2.5 py-0.5 rounded-full ' + pColor(dp)}>{pLabel(dp)}</span>}
          </div>
          {phase === 'input' && (
            <div className="space-y-2">
              <label className="text-sm font-semibold">Format</label>
              <div className="grid grid-cols-2 h-11 rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
                <button onClick={() => handleFormatChange('audio')} className={'rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ' + (format === 'audio' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500')}>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg> MP3
                </button>
                <button onClick={() => handleFormatChange('video')} className={'rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ' + (format === 'video' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500')}>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg> MP4
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
                  <img src={videoInfo.thumbnail} alt={videoInfo.title} className="w-full object-cover" style={{ maxHeight: '360px' }} onError={(e: any) => { if (videoId) e.currentTarget.src = 'https://i.ytimg.com/vi/' + videoId + '/mqdefault.jpg'; else e.currentTarget.style.display = 'none'; }} />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-14 h-14 rounded-full bg-red-600 flex items-center justify-center"><svg className="w-6 h-6 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></div>
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
                {videoInfo.platform && <span className={'text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ' + pColor(videoInfo.platform)}>{pLabel(videoInfo.platform)}</span>}
              </div>
            </div>

            <div ref={convertersRef} className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-gray-200 dark:border-gray-800 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-base">Converters</h2>
                  <span className="text-[11px] text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">{convList.length}</span>
                </div>
                <button onClick={handleReset} className="text-xs text-gray-500 hover:text-red-500 flex items-center gap-1">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg> New
                </button>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 space-y-1.5">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">How to download:</p>
                <ol className="text-[11px] text-gray-500 list-decimal list-inside pl-1"><li>Click a converter {'\u2014'} opens in new tab</li><li>Your URL is <strong>auto-copied</strong></li><li>Press Ctrl+V to paste, convert and download</li></ol>
              </div>
              {launched && (
                <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 dark:bg-green-950/30 dark:text-green-400 px-3 py-2 rounded-lg">
                  <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                  URL copied! Paste in {launched} tab with Ctrl+V
                </div>
              )}
              <div className="space-y-2.5">
                {convList.map((svc: any) => (
                  <button key={svc.name} onClick={() => openConverter(svc)} className="w-full flex items-center gap-3 p-3.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-800 transition-all text-left group hover:shadow-md">
                    <div className={'w-11 h-11 rounded-lg bg-gradient-to-br ' + svc.color + ' flex items-center justify-center text-white flex-shrink-0 shadow-md'}>
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm">{svc.name}</span>
                        {svc.recommended && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">BEST</span>}
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5">{svc.desc}</p>
                    </div>
                    <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                      <svg className="w-4 h-4 text-gray-400 group-hover:text-red-500 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      <button onClick={(e) => { e.stopPropagation(); toggleFav(svc.name); }} className="p-0.5">
                        <svg className={'w-3.5 h-3.5 ' + (svc.name === favorite ? 'text-yellow-500' : 'text-gray-300')} viewBox="0 0 24 24" fill={svc.name === favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                      </button>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-red-200 dark:border-red-900 p-5 space-y-3">
            <div className="flex items-start gap-2 text-red-600">
              <svg className="w-5 h-5 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              <p className="text-sm">{error}</p>
            </div>
            <button onClick={handleReset} className="text-sm font-medium text-red-600">Try Again</button>
          </div>
        )}

        {phase === 'input' && (
          <div className="grid grid-cols-3 gap-3 mt-2">
            {[
              { icon: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>', t: 'Audio', d: 'Convert to MP3' },
              { icon: '<path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2"/>', t: 'Video', d: 'Download MP4' },
              { icon: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>', t: 'Fast', d: 'Paste and go' },
            ].map((f: any) => (
              <div key={f.t} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3 text-center hover:shadow-md transition-shadow">
                <div className="w-9 h-9 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-2">
                  <svg className="w-5 h-5 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: f.icon }} />
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
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-gray-900 to-black flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  
                </div>
                              <div className="flex flex-col items-center gap-1.5 group">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-gray-900 to-black flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <img src="data:image/png;base64,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" width="24" height="24" alt="BeReal" />
                </div>
                <span className="text-[11px] font-medium text-gray-500">BeReal</span>
              </div>
        )}

        {phase === 'input' && history.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 space-y-3 mt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-gray-500">Recent</h3>
              <button onClick={clearHist} className="text-[11px] text-gray-400 hover:text-red-500">Clear</button>
            </div>
            {history.slice(0, 4).map((h: any, i: number) => (
              <button key={i} onClick={() => setUrl(h.url)} className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left">
                <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 bg-gray-200 dark:bg-gray-700"><span className="text-[8px] font-bold text-gray-600 dark:text-gray-300">{pLabel(h.platform).charAt(0)}</span></div>
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
