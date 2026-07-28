'use client';

import { useState, useCallback, useEffect } from 'react';

function getPlatform(u: string): 'youtube' | 'soundcloud' | 'twitter' | 'instagram' | null {
  if (/youtu\.?be|youtube\.com/i.test(u)) return 'youtube';
  if (/soundcloud\.com/i.test(u)) return 'soundcloud';
  if (/twitter\.com|x\.com/i.test(u)) return 'twitter';
  if (/instagram\.com/i.test(u)) return 'instagram';
  return null;
}
function extractVideoId(url: string): string | null {
  const m = url.match(/(?:v=|youtu\.be\/|shorts\/|live\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}
function pLabel(p: string | null) {
  if (p === 'youtube') return 'YouTube';
  if (p === 'soundcloud') return 'SoundCloud';
  if (p === 'twitter') return 'X';
  if (p === 'instagram') return 'Instagram';
  return '';
}
function pColor(p: string | null) {
  if (p === 'youtube') return 'bg-red-100 text-red-700';
  if (p === 'soundcloud') return 'bg-orange-100 text-orange-700';
  if (p === 'twitter') return 'bg-sky-100 text-sky-700';
  if (p === 'instagram') return 'bg-pink-100 text-pink-700';
  return 'bg-gray-100 text-gray-600';
}

type Phase = 'input' | 'loading' | 'ready' | 'error';
interface VideoInfo { title: string; author: string; thumbnail: string; duration?: string; views?: string; published?: string; platform?: string; }
interface ConverterService { name: string; url: string; desc: string; color: string; platform: string[]; recommended?: boolean; note?: string; }
interface HistoryItem { title: string; url: string; platform: string; time: number; }

const tips = [
  'Paste any YouTube, SoundCloud, X, or Instagram link.',
  'Your URL is auto-copied when you pick a converter.',
  'If one converter has ads, try another.',
  'All converters are free, no sign-up needed.',
  'Press Enter after pasting to fetch info instantly.',
];

export default function Home() {
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState<'audio' | 'video'>('video');
  const [phase, setPhase] = useState<Phase>('input');
  const [error, setError] = useState('');
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [launched, setLaunched] = useState<string | null>(null);
  const [tipIdx, setTipIdx] = useState(0);
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem('yt-convert-history') || '[]'); } catch { return []; }
  });
  const [favorite, setFavorite] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('yt-convert-fav') || '';
  });

  useEffect(() => { const i = setInterval(() => setTipIdx(t => (t + 1) % tips.length), 5000); return () => clearInterval(i); }, []);

  const detectedPlatform = url.trim() ? getPlatform(url.trim()) : null;

  const handleGetInfo = useCallback(async () => {
    if (!url.trim()) return;
    const plat = getPlatform(url.trim());
    if (!plat) { setError('Unsupported URL. Use YouTube, SoundCloud, X, or Instagram.'); setPhase('error'); return; }
    setError(''); setPhase('loading'); setVideoInfo(null); setLaunched(null);
    try {
      const resp = await fetch('/api/video-info?url=' + encodeURIComponent(url.trim()));
      if (!resp.ok) { const d = await resp.json().catch(() => ({})); throw new Error(d.error || 'Failed to load'); }
      const data = await resp.json();
      const vid = extractVideoId(url.trim());
      const thumb = plat === 'youtube' && vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : (data.thumbnail || '');
      setVideoInfo({ title: data.title || 'Unknown', author: data.author || '', thumbnail: thumb, duration: data.duration || '', views: data.views || '', published: data.published || '', platform: data.platform || plat });
      const h = [{ title: data.title || 'Unknown', url: url.trim(), platform: plat, time: Date.now() }, ...history.filter(x => x.url !== url.trim())].slice(0, 6);
      setHistory(h);
      try { localStorage.setItem('yt-convert-history', JSON.stringify(h)); } catch {}
      setPhase('ready');
    } catch (e: any) { setError(e.message || 'Failed to load.'); setPhase('error'); }
  }, [url, history]);

  const videoId = videoInfo ? extractVideoId(url.trim()) : null;

  const allConverters: ConverterService[] = [
    { name: 'Y2Mate', url: 'https://v27.www-y2mate.com/', desc: 'MP4 (144p-1080p) & MP3 (128-320kbps).', color: 'from-rose-500 to-rose-600', platform: ['youtube'], recommended: true },
    { name: 'Y2Mate (alt)', url: 'https://en.y2mate.so/youtube-converter/', desc: 'Alt Y2Mate domain.', color: 'from-orange-500 to-orange-600', platform: ['youtube'], note: 'May need Cloudflare check' },
    { name: 'AudioConverter', url: 'https://audioconverter.ai/youtube-to-mp4-converter', desc: 'YouTube to MP4. HD and 4K.', color: 'from-sky-500 to-sky-600', platform: ['youtube'] },
    { name: 'Hicoo', url: 'https://hicoo.ai/mp4-converter/youtube-to-mp4', desc: 'YouTube to MP4. 360p to 4K.', color: 'from-emerald-500 to-emerald-600', platform: ['youtube'] },
    { name: 'KlickAud', url: 'https://www.klickaud.co/', desc: 'SoundCloud to MP3.', color: 'from-orange-400 to-orange-500', platform: ['soundcloud'], recommended: true },
    { name: 'SC Downloader', url: 'https://soundcloudmp3.org/', desc: 'SoundCloud tracks as MP3.', color: 'from-amber-500 to-amber-600', platform: ['soundcloud'] },
    { name: 'SSSTik', url: 'https://ssstik.io/', desc: 'X/Twitter video downloader.', color: 'from-sky-400 to-sky-500', platform: ['twitter'], recommended: true },
    { name: 'Twitsave', url: 'https://twitsave.com/', desc: 'Save X/Twitter videos in HD.', color: 'from-indigo-500 to-indigo-600', platform: ['twitter'] },
    { name: 'SaveInsta', url: 'https://www.saveinsta.app/', desc: 'Instagram photos & videos.', color: 'from-pink-400 to-pink-500', platform: ['instagram'], recommended: true },
    { name: 'iGram', url: 'https://igram.io/', desc: 'Instagram reels & stories.', color: 'from-purple-500 to-purple-600', platform: ['instagram'] },
  ];

  const getConverters = useCallback((): ConverterService[] => {
    const plat = videoInfo?.platform || getPlatform(url.trim());
    if (!plat) return allConverters.slice(0, 4);
    const f = allConverters.filter(c => c.platform.includes(plat));
    return f.sort((a, b) => { if (a.name === favorite) return -1; if (b.name === favorite) return 1; if (a.recommended && !b.recommended) return -1; return 0; });
  }, [videoInfo, url, favorite]);

  const openConverter = useCallback((c: ConverterService) => {
    navigator.clipboard.writeText(url.trim()).catch(() => {});
    setLaunched(c.name);
    window.open(c.url, '_blank', 'noopener');
  }, [url]);

  const toggleFav = useCallback((n: string) => { const v = favorite === n ? '' : n; setFavorite(v); try { localStorage.setItem('yt-convert-fav', v); } catch {} }, [favorite]);
  const clearHist = useCallback(() => { setHistory([]); try { localStorage.removeItem('yt-convert-history'); } catch {} }, []);
  const handleReset = useCallback(() => { setPhase('input'); setError(''); setVideoInfo(null); setLaunched(null); }, []);
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => { if (e.key === 'Enter' && (phase === 'input' || phase === 'error')) handleGetInfo(); }, [phase, handleGetInfo]);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/20">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8Z" fill="white"/><path d="m9.75 15.02 5.75-3.02-5.75-3.02v6.04Z" fill="#FF0000"/></svg>
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-gray-900 dark:text-white">YT Convert</h1>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">YouTube &middot; SoundCloud &middot; X &middot; Instagram</p>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 space-y-5">
        {/* URL Input */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-800 transition-colors p-5 space-y-4">
          <label htmlFor="url-input" className="text-sm font-semibold text-gray-800 dark:text-gray-200">Paste any link</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              <input id="url-input" type="url" placeholder="https://www.youtube.com/watch?v=..." value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={handleKeyDown} disabled={phase === 'loading'} className="w-full pl-10 pr-3 h-11 text-sm rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent placeholder:text-gray-400" />
            </div>
            {(phase === 'input' || phase === 'error') && (
              <button onClick={handleGetInfo} disabled={!url.trim() || phase === 'loading'} className="h-11 px-5 rounded-xl bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-sm font-semibold shadow-lg shadow-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2">
                Go <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </button>
            )}
          </div>
          {detectedPlatform && phase === 'input' && (
            <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${pColor(detectedPlatform)}`}>{pLabel(detectedPlatform)}</span>
          )}
          {phase === 'input' && (
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-800 dark:text-gray-200">Format</label>
              <div className="grid grid-cols-2 h-11 rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
                <button onClick={() => setFormat('audio')} className={`rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${format === 'audio' ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                  MP3
                </button>
                <button onClick={() => setFormat('video')} className={`rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${format === 'video' ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>
                  MP4
                </button>
              </div>
            </div>
          )}
          {phase === 'input' && <p className="text-xs text-gray-400 text-center animate-pulse">{tips[tipIdx]}</p>}
        </div>

        {/* Loading */}
        {phase === 'loading' && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-red-200 dark:border-red-900 p-8 text-center space-y-3">
            <div className="w-8 h-8 border-3 border-red-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-gray-500">Fetching info...</p>
            <div className="max-w-xs mx-auto space-y-2"><div className="h-3 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" /><div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-3/4 animate-pulse" /></div>
          </div>
        )}

        {/* Video Info + Converters */}
        {phase === 'ready' && videoInfo && (
          <>
            <div className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-red-200 dark:border-red-900 overflow-hidden p-5 space-y-4">
              {videoInfo.thumbnail && (
                <div className="relative rounded-xl overflow-hidden bg-black group cursor-pointer" onClick={() => { if (videoId) window.open('https://www.youtube.com/watch?v=' + videoId, '_blank', 'noopener'); else window.open(url.trim(), '_blank', 'noopener'); }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={videoInfo.thumbnail} alt={videoInfo.title} className="w-full object-cover" style={{ maxHeight: '360px' }} onError={(e) => { const t = e.target as HTMLImageElement; if (videoId) t.src = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`; }} />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-14 h-14 rounded-full bg-red-600 flex items-center justify-center shadow-lg">
                      <svg className="w-6 h-6 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                  </div>
                  {videoInfo.duration && <span className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-0.5 rounded">{videoInfo.duration}</span>}
                </div>
              )}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-sm text-gray-900 dark:text-white line-clamp-2">{videoInfo.title}</h3>
                  {videoInfo.author && <p className="text-xs text-gray-500 mt-1">{videoInfo.author}</p>}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {videoInfo.views && <span className="text-[11px] text-gray-400">{videoInfo.views} views</span>}
                    {videoInfo.published && <span className="text-[11px] text-gray-400">{videoInfo.published}</span>}
                  </div>
                </div>
                {videoInfo.platform && <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${pColor(videoInfo.platform)}`}>{pLabel(videoInfo.platform)}</span>}
              </div>
            </div>

            {/* Converters */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-gray-200 dark:border-gray-800 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-base text-gray-900 dark:text-white">Converters</h2>
                <button onClick={handleReset} className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
                  New
                </button>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 space-y-1.5">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                  How to download:
                </p>
                <ol className="text-[11px] text-gray-500 space-y-0.5 list-decimal list-inside pl-1">
                  <li>Click a converter — opens in new tab</li>
                  <li>Your URL is <strong>auto-copied</strong> to clipboard</li>
                  <li>Press Ctrl+V to paste, then convert &amp; download</li>
                </ol>
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
                        <span className="font-semibold text-sm text-gray-900 dark:text-white">{svc.name}</span>
                        {svc.recommended && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">BEST</span>}
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5">{svc.desc}</p>
                      {svc.note && <p className="text-[10px] text-amber-600 mt-0.5">{svc.note}</p>}
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
          </>
        )}

        {/* Error */}
        {phase === 'error' && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-red-200 dark:border-red-900 p-5 space-y-3">
            <div className="flex items-start gap-2 text-red-600">
              <svg className="w-5 h-5 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              <p className="text-sm">{error}</p>
            </div>
            <button onClick={handleReset} className="text-sm font-medium text-red-600 hover:text-red-700 flex items-center gap-1.5">Try Again <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg></button>
          </div>
        )}

        {/* Features */}
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
                <h3 className="font-semibold text-xs text-gray-900 dark:text-white">{f.t}</h3>
                <p className="text-[10px] text-gray-500 mt-0.5">{f.d}</p>
              </div>
            ))}
          </div>
        )}

        {/* Platforms */}
        {phase === 'input' && (
          <div className="mt-6">
            <h3 className="text-xs font-semibold text-center mb-3 text-gray-400 uppercase tracking-wider">Supported Platforms</h3>
            <div className="grid grid-cols-4 gap-3">
              <div className="flex flex-col items-center gap-1.5 group">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8Z" fill="white"/><path d="m9.75 15.02 5.75-3.02-5.75-3.02v6.04Z" fill="#FF0000"/></svg>
                </div>
                <span className="text-[11px] font-medium text-gray-500">YouTube</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 group">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M11.56 8.87V17h8.76c.58 0 1.07-.5.93-1.07-.69-2.86-2.66-5.25-5.36-6.59a6.96 6.96 0 0 0-4.33-.47Z" fill="white"/><path d="M11.56 3.47c-3.6 0-6.84 1.5-9.16 3.9a.75.75 0 0 0 .04 1.08c2.6 2.22 5.97 3.57 9.12 3.57V3.47Z" fill="white" opacity=".6"/><path d="M1.83 15.4c-.45-.18-.83.33-.58.72A11.55 11.55 0 0 0 11.56 21V12.5c-3.35 0-6.92 1.19-9.73 2.9Z" fill="white" opacity=".9"/></svg>
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
            </div>
          </div>
        )}

        {/* History */}
        {phase === 'input' && history.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 space-y-3 mt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 flex items-center gap-1.5">Recent</h3>
              <button onClick={clearHist} className="text-[11px] text-gray-400 hover:text-red-500">Clear</button>
            </div>
            {history.slice(0, 4).map((h, i) => (
              <button key={i} onClick={() => setUrl(h.url)} className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left">
                <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 bg-gray-200 dark:bg-gray-700">
                  <span className="text-[8px] font-bold text-gray-600 dark:text-gray-300">{pLabel(h.platform).charAt(0)}</span>
                </div>
                <span className="text-xs text-gray-500 truncate flex-1">{h.title}</span>
              </button>
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-gray-200 dark:border-gray-800 py-3 mt-auto">
        <p className="text-center text-[11px] text-gray-400">YT Convert &mdash; For personal use only</p>
      </footer>
    </div>
  );
}
