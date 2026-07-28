'use client';

import { useState, useCallback, useEffect } from 'react';

const sGet = (k: string) => (typeof window === 'undefined' ? '' : localStorage.getItem(k) || '');
const sSet = (k: string, v: string) => { if (typeof window !== 'undefined') localStorage.setItem(k, v) };
const sGetJ = (k: string) => { try { return typeof window === 'undefined' ? null : JSON.parse(localStorage.getItem(k) || 'null') } catch { return null } };
const sSetJ = (k: string, v: unknown) => { if (typeof window !== 'undefined') localStorage.setItem(k, JSON.stringify(v)) };

function getPlatform(u) {
  if (/youtu\.?be|youtube\.com/i.test(u)) return 'youtube';
  if (/soundcloud\.com/i.test(u)) return 'soundcloud';
  if (/twitter\.com|x\.com/i.test(u)) return 'twitter';
  if (/instagram\.com/i.test(u)) return 'instagram';
  if (/spotify\.com|open\.spotify\.com/i.test(u)) return 'spotify';
  return null;
}
function extractVideoId(url) {
  const m = url.match(/(?:v=|youtu\.be\/|shorts\/|live\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}
function pLabel(p) { return { youtube: 'YouTube', soundcloud: 'SoundCloud', twitter: 'X', instagram: 'Instagram', spotify: 'Spotify' }[p] || ''; }
function pColor(p) {
  return { youtube: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', soundcloud: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', twitter: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400', instagram: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400', spotify: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' }[p] || 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
}

const tips = ['Paste any YouTube, SoundCloud, X, Instagram, or Spotify link.', 'Your URL is auto-copied when you pick a converter.', 'If one converter has ads, try another.', 'All converters are free, no sign-up needed.', 'Press Enter after pasting to fetch info instantly.'];

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState('video');
  const [phase, setPhase] = useState('input');
  const [error, setError] = useState('');
  const [videoInfo, setVideoInfo] = useState(null);
  const [launched, setLaunched] = useState(null);
  const [tipIdx, setTipIdx] = useState(0);
  const [dark, setDark] = useState(false);
  const [history, setHistory] = useState([]);
  const [favorite, setFavorite] = useState('');

  useEffect(() => {
    setMounted(true);
    const s = sGet('yt-convert-dark');
    const d = s !== '' ? s === '1' : window.matchMedia('(prefers-color-scheme:dark)').matches;
    setDark(d);
    document.documentElement.classList.toggle('dark', d);
    setHistory(sGetJ('yt-convert-history') || []);
    setFavorite(sGet('yt-convert-fav'));
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

  const dp = url.trim() ? getPlatform(url.trim()) : null;

  const handleGetInfo = useCallback(async () => {
    if (!url.trim()) return;
    const plat = getPlatform(url.trim());
    if (!plat) { setError('Unsupported URL.'); setPhase('error'); return; }
    setError(''); setPhase('loading'); setVideoInfo(null); setLaunched(null);
    try {
      const r = await fetch('/api/video-info?url=' + encodeURIComponent(url.trim()));
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Failed'); }
      const data = await r.json();
      const vid = extractVideoId(url.trim());
      setVideoInfo({ title: data.title || 'Unknown', author: data.author || '', thumbnail: plat === 'youtube' && vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : (data.thumbnail || ''), duration: data.duration || '', views: data.views || '', published: data.published || '', platform: data.platform || plat });
      const h = [{ title: data.title || 'Unknown', url: url.trim(), platform: plat, time: Date.now() }, ...history.filter(x => x.url !== url.trim())].slice(0, 6);
      setHistory(h); sSetJ('yt-convert-history', h); setPhase('ready');
    } catch (e) { setError(e.message || 'Failed.'); setPhase('error'); }
  }, [url, history]);

  const videoId = videoInfo ? extractVideoId(url.trim()) : null;

  const all = [
    { name: '9Convert', url: 'https://9convert.org/', desc: 'YouTube to MP3 & MP4. Fast and reliable.', color: 'from-rose-500 to-rose-600', platform: ['youtube'], recommended: true },
    { name: 'Y2Mate', url: 'https://v27.www-y2mate.com/', desc: 'MP4 (144p-1080p) & MP3 (128-320kbps).', color: 'from-orange-500 to-orange-600', platform: ['youtube'] },
    { name: 'AudioConverter', url: 'https://audioconverter.ai/youtube-to-mp4-converter', desc: 'YouTube to MP4. HD and 4K.', color: 'from-sky-500 to-sky-600', platform: ['youtube'] },
    { name: 'Hicoo', url: 'https://hicoo.ai/mp4-converter/youtube-to-mp4', desc: 'YouTube to MP4. 360p to 4K.', color: 'from-emerald-500 to-emerald-600', platform: ['youtube'] },
    { name: 'KlickAud', url: 'https://www.klickaud.co/', desc: 'SoundCloud to MP3.', color: 'from-orange-400 to-orange-500', platform: ['soundcloud'], recommended: true },
    { name: 'SSSTik', url: 'https://ssstik.io/', desc: 'X/Twitter video downloader.', color: 'from-sky-400 to-sky-500', platform: ['twitter'], recommended: true },
    { name: 'Twitsave', url: 'https://twitsave.com/', desc: 'Save X/Twitter videos in HD.', color: 'from-indigo-500 to-indigo-600', platform: ['twitter'] },
    { name: 'SaveInsta', url: 'https://www.saveinsta.app/', desc: 'Instagram photos & videos.', color: 'from-pink-400 to-pink-500', platform: ['instagram'], recommended: true },
    { name: 'iGram', url: 'https://igram.io/', desc: 'Instagram reels & stories.', color: 'from-purple-500 to-purple-600', platform: ['instagram'] },
    { name: 'SpotifyDown', url: 'https://spotifydown.com/', desc: 'Spotify tracks to MP3.', color: 'from-green-500 to-green-600', platform: ['spotify'], recommended: true },
  ];

  const getConverters = useCallback(() => {
    const plat = videoInfo?.platform || getPlatform(url.trim());
    if (!plat) return all.slice(0, 4);
    return all.filter(c => c.platform.includes(plat)).sort((a, b) => { if (a.name === favorite) return -1; if (b.name === favorite) return 1; if (a.recommended && !b.recommended) return -1; return 0; });
  }, [videoInfo, url, favorite]);

  const openConverter = (c) => { navigator.clipboard.writeText(url.trim()).catch(() => {}); setLaunched(c.name); window.open(c.url, '_blank', 'noopener'); };
  const toggleFav = (n) => { const v = favorite === n ? '' : n; setFavorite(v); sSet('yt-convert-fav', v); };
  const clearHist = () => { setHistory([]); if (typeof window !== 'undefined') localStorage.removeItem('yt-convert-history'); };
  const handleReset = () => { setPhase('input'); setError(''); setVideoInfo(null); setLaunched(null); };
  const handleKeyDown = (e) => { if (e.key === 'Enter' && (phase === 'input' || phase === 'error')) handleGetInfo(); };

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
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-red-500 to-red-600 shadow-lg shadow-red-500/20">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8Z" fill="white"/><path d="m9.75 15.02 5.75-3.02-5.75-3.02v6.04Z" fill="#FF0000"/></svg>
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight">YT Convert</h1>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">YouTube {'\u00B7'} SoundCloud {'\u00B7'} X {'\u00B7'} Instagram {'\u00B7'} Spotify</p>
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
              <input id="url-input" type="url" placeholder="https://www.youtube.com/watch?v=..." value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={handleKeyDown} disabled={phase === 'loading'} className="w-full pl-10 pr-3 h-11 text-sm rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent placeholder:text-gray-400 dark:text-white" />
            </div>
            {(phase === 'input' || phase === 'error') && (
              <button onClick={handleGetInfo} disabled={!url.trim() || phase === 'loading'} className="h-11 px-5 rounded-xl bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-sm font-semibold shadow-lg shadow-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2">
                Go <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </button>
            )}
          </div>
          {dp && phase === 'input' && <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${pColor(dp)}`}>{pLabel(dp)}</span>}
          {phase === 'input' && (
            <div className="space-y-2">
              <label className="text-sm font-semibold">Format</label>
              <div className="grid grid-cols-2 h-11 rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
                <button onClick={() => setFormat('audio')} className={`rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${format === 'audio' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500'}`}>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg> MP3
                </button>
                <button onClick={() => setFormat('video')} className={`rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${format === 'video' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500'}`}>
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
                  <img src={videoInfo.thumbnail} alt={videoInfo.title} className="w-full object-cover" style={{ maxHeight: '360px' }} onError={(e) => { if (videoId) e.currentTarget.src = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`; }} />
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
                {videoInfo.platform && <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${pColor(videoInfo.platform)}`}>{pLabel(videoInfo.platform)}</span>}
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-gray-200 dark:border-gray-800 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-base">Converters</h2>
                <button onClick={handleReset} className="text-xs text-gray-500 hover:text-red-500 flex items-center gap-1">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg> New
                </button>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 space-y-1.5">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">How to download:</p>
                <ol className="text-[11px] text-gray-500 list-decimal list-inside pl-1"><li>Click a converter {'\u2014'} opens in new tab</li><li>Your URL is <strong>auto-copied</strong></li><li>Press Ctrl+V to paste, convert {'&'} download</li></ol>
              </div>
              {launched && (
                <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 dark:bg-green-950/30 dark:text-green-400 px-3 py-2 rounded-lg">
                  <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                  URL copied! Paste in {launched} tab with Ctrl+V
                </div>
              )}
              <div className="space-y-2.5">
                {getConverters().map((svc) => (
                  <button key={svc.name} onClick={() => openConverter(svc)} className="w-full flex items-center gap-3 p-3.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-800 transition-all text-left group hover:shadow-md">
                    <div className={`w-11 h-11 rounded-lg bg-gradient-to-br ${svc.color} flex items-center justify-center text-white flex-shrink-0 shadow-md`}>
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
                        <svg className={`w-3.5 h-3.5 ${svc.name === favorite ? 'text-yellow-500' : 'text-gray-300'}`} viewBox="0 0 24 24" fill={svc.name === favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
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
              { icon: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>', t: 'Fast', d: 'Paste & go' },
            ].map(f => (
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
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <div className="w-7 h-7" style={{ WebkitMaskImage: "url('https://www.google.com/s2/favicons?domain=soundcloud.com&sz=128')", maskImage: "url('https://www.google.com/s2/favicons?domain=soundcloud.com&sz=128')", WebkitMaskSize: 'contain', maskSize: 'contain', WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat', WebkitMaskPosition: 'center', maskPosition: 'center', backgroundColor: 'white' }} />
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
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="5" stroke="white" strokeWidth="2"/><circle cx="12" cy="12" r="5" stroke="white" strokeWidth="2"/><circle cx="17.5" cy="6.5" r="1.5" fill="white"/></svg>
                </div>
                <span className="text-[11px] font-medium text-gray-500">Instagram</span>
              </div>
                            <div className="flex flex-col items-center gap-1.5 group">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg>
                </div>
                <span className="text-[11px] font-medium text-gray-500">SoundCloud</span>
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
            {history.slice(0, 4).map((h, i) => (
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
