'use client';

import { useState, useCallback, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  Download, Music, Video, Link2, Loader2,
  XCircle, AlertCircle, ArrowRight, Zap,
  ExternalLink, ClipboardCheck, Play, Info,
  CheckCircle2, Star, Clock, Trash2
} from 'lucide-react';

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
  if (p === 'youtube') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  if (p === 'soundcloud') return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
  if (p === 'twitter') return 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400';
  if (p === 'instagram') return 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400';
  return 'bg-muted text-muted-foreground';
}
function pBadge(p: string | null) {
  if (p === 'youtube') return 'bg-red-500';
  if (p === 'soundcloud') return 'bg-orange-500';
  if (p === 'twitter') return 'bg-gray-800 dark:bg-gray-200';
  if (p === 'instagram') return 'bg-gradient-to-br from-pink-500 to-purple-600';
  return 'bg-muted';
}

type Phase = 'input' | 'loading' | 'ready' | 'error';

interface VideoInfo { title: string; author: string; thumbnail: string; duration?: string; views?: string; published?: string; platform?: string; }

interface ConverterService { name: string; url: string; desc: string; color: string; icon: 'download' | 'zap' | 'video'; platform: string[]; recommended?: boolean; note?: string; }

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
  const { toast } = useToast();

  useEffect(() => { const i = setInterval(() => setTipIdx(t => (t + 1) % tips.length), 5000); return () => clearInterval(i); }, []);

  const detectedPlatform = url.trim() ? getPlatform(url.trim()) : null;

  const handleGetInfo = useCallback(async () => {
    if (!url.trim()) { toast({ title: 'Enter a URL', variant: 'destructive' }); return; }
    const plat = getPlatform(url.trim());
    if (!plat) { toast({ title: 'Unsupported URL', description: 'Use a YouTube, SoundCloud, X, or Instagram link.', variant: 'destructive' }); return; }
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
  }, [url, toast, history]);

  const videoId = videoInfo ? extractVideoId(url.trim()) : null;

  const allConverters: ConverterService[] = [
    { name: 'Y2Mate', url: 'https://v27.www-y2mate.com/', desc: 'MP4 (144p-1080p) & MP3 (128-320kbps).', color: 'bg-rose-600 hover:bg-rose-700', icon: 'download', platform: ['youtube'], recommended: true },
    { name: 'Y2Mate (alt)', url: 'https://en.y2mate.so/youtube-converter/', desc: 'Alt Y2Mate domain.', color: 'bg-orange-600 hover:bg-orange-700', icon: 'zap', platform: ['youtube'], note: 'May need Cloudflare check' },
    { name: 'AudioConverter', url: 'https://audioconverter.ai/youtube-to-mp4-converter', desc: 'YouTube to MP4. HD and 4K.', color: 'bg-sky-600 hover:bg-sky-700', icon: 'video', platform: ['youtube'] },
    { name: 'Hicoo', url: 'https://hicoo.ai/mp4-converter/youtube-to-mp4', desc: 'YouTube to MP4. 360p to 4K.', color: 'bg-emerald-600 hover:bg-emerald-700', icon: 'zap', platform: ['youtube'] },
    { name: 'KlickAud', url: 'https://www.klickaud.co/', desc: 'SoundCloud to MP3.', color: 'bg-orange-500 hover:bg-orange-600', icon: 'download', platform: ['soundcloud'], recommended: true },
    { name: 'SC Downloader', url: 'https://soundcloudmp3.org/', desc: 'SoundCloud tracks as MP3.', color: 'bg-amber-600 hover:bg-amber-700', icon: 'zap', platform: ['soundcloud'] },
    { name: 'SSSTik', url: 'https://ssstik.io/', desc: 'X/Twitter video downloader.', color: 'bg-sky-500 hover:bg-sky-600', icon: 'download', platform: ['twitter'], recommended: true },
    { name: 'Twitsave', url: 'https://twitsave.com/', desc: 'Save X/Twitter videos in HD.', color: 'bg-indigo-600 hover:bg-indigo-700', icon: 'video', platform: ['twitter'] },
    { name: 'SaveInsta', url: 'https://www.saveinsta.app/', desc: 'Instagram photos & videos.', color: 'bg-pink-500 hover:bg-pink-600', icon: 'download', platform: ['instagram'], recommended: true },
    { name: 'iGram', url: 'https://igram.io/', desc: 'Instagram reels & stories.', color: 'bg-purple-600 hover:bg-purple-700', icon: 'zap', platform: ['instagram'] },
  ];

  const getConverters = useCallback((): ConverterService[] => {
    const plat = videoInfo?.platform || getPlatform(url.trim());
    if (!plat) return allConverters.slice(0, 4);
    const f = allConverters.filter(c => c.platform.includes(plat));
    return f.sort((a, b) => { if (a.name === favorite) return -1; if (b.name === favorite) return 1; if (a.recommended && !b.recommended) return -1; return 0; });
  }, [videoInfo, url, favorite]);

  const openConverter = useCallback((c: ConverterService) => {
    navigator.clipboard.writeText(url.trim()).then(() => { toast({ title: 'URL copied!', description: 'Go to the converter tab and Ctrl+V to paste.', duration: 8000 }); setLaunched(c.name); }).catch(() => { toast({ title: 'Open converter', description: 'Copy the URL manually.', duration: 6000 }); setLaunched(c.name); });
    window.open(c.url, '_blank', 'noopener');
  }, [url, toast]);

  const toggleFav = useCallback((n: string) => { const v = favorite === n ? '' : n; setFavorite(v); try { localStorage.setItem('yt-convert-fav', v); } catch {} }, [favorite]);
  const clearHist = useCallback(() => { setHistory([]); try { localStorage.removeItem('yt-convert-history'); } catch {} }, []);
  const handleReset = useCallback(() => { setPhase('input'); setError(''); setVideoInfo(null); setLaunched(null); }, []);
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => { if (e.key === 'Enter' && (phase === 'input' || phase === 'error')) handleGetInfo(); }, [phase, handleGetInfo]);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-muted/30">
      <header className="border-b bg-background/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/20">
            <Video className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">YT Convert</h1>
            <p className="text-xs text-muted-foreground">YouTube &middot; SoundCloud &middot; X &middot; Instagram</p>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8 space-y-6">
        <Card className="border-2 border-dashed border-muted-foreground/20 hover:border-primary/40 transition-colors">
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="url-input" className="text-sm font-medium">Paste any link</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input id="url-input" type="url" placeholder="https://www.youtube.com/watch?v=..." value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={handleKeyDown} disabled={phase === 'loading'} className="pl-10 h-12 text-base" />
                </div>
                {(phase === 'input' || phase === 'error') && (
                  <Button onClick={handleGetInfo} disabled={!url.trim() || phase === 'loading'} className="h-12 px-6 gap-2 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-lg shadow-red-500/20">
                    <ArrowRight className="w-4 h-4" /> Go
                  </Button>
                )}
              </div>
              {detectedPlatform && phase === 'input' && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${pColor(detectedPlatform)}`}>{pLabel(detectedPlatform)}</span>
              )}
            </div>
            {phase === 'input' && (
              <div className="space-y-3">
                <Label className="text-sm font-medium">Preferred Format</Label>
                <Tabs value={format} onValueChange={(v) => setFormat(v as 'audio' | 'video')}>
                  <TabsList className="w-full grid grid-cols-2 h-12">
                    <TabsTrigger value="audio" className="gap-2 h-full"><Music className="w-4 h-4" />Audio (MP3)</TabsTrigger>
                    <TabsTrigger value="video" className="gap-2 h-full"><Video className="w-4 h-4" />Video (MP4)</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            )}
            {phase === 'input' && <p className="text-xs text-muted-foreground text-center animate-pulse">{tips[tipIdx]}</p>}
          </CardContent>
        </Card>

        {phase === 'loading' && (
          <Card className="border-2 border-primary/30"><CardContent className="p-8 text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">Fetching info...</p>
            <div className="max-w-xs mx-auto space-y-2"><div className="h-3 bg-muted rounded animate-pulse" /><div className="h-3 bg-muted rounded w-3/4 animate-pulse" /></div>
          </CardContent></Card>
        )}

        {phase === 'ready' && videoInfo && (
          <>
            <Card className="border-2 border-primary/30 overflow-hidden"><CardContent className="p-6 space-y-4">
              {videoInfo.thumbnail && (
                <div className="relative rounded-xl overflow-hidden bg-black group cursor-pointer" onClick={() => { if (videoId) window.open('https://www.youtube.com/watch?v=' + videoId, '_blank', 'noopener'); else window.open(url.trim(), '_blank', 'noopener'); }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={videoInfo.thumbnail} alt={videoInfo.title} className="w-full object-cover" style={{ maxHeight: '360px' }} onError={(e) => { const t = e.target as HTMLImageElement; if (videoId) t.src = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`; }} />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center shadow-lg"><Play className="w-7 h-7 text-white ml-1" fill="white" /></div>
                  </div>
                  {videoInfo.duration && <span className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-0.5 rounded">{videoInfo.duration}</span>}
                </div>
              )}
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-sm line-clamp-2">{videoInfo.title}</h3>
                  {videoInfo.author && <p className="text-xs text-muted-foreground mt-1">{videoInfo.author}</p>}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {videoInfo.views && <span className="text-[11px] text-muted-foreground">{videoInfo.views} views</span>}
                    {videoInfo.published && <span className="text-[11px] text-muted-foreground">{videoInfo.published}</span>}
                  </div>
                </div>
                {videoInfo.platform && <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${pColor(videoInfo.platform)}`}>{pLabel(videoInfo.platform)}</span>}
              </div>
            </CardContent></Card>

            <Card className="border-2"><CardContent className="p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-lg">Converters</h2>
                <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5 text-xs"><ArrowRight className="w-3 h-3 rotate-180" /> New</Button>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium"><Info className="w-4 h-4 text-primary" />How to download:</div>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside pl-1">
                  <li>Click a converter below — opens in new tab</li>
                  <li>Your URL is <strong>auto-copied</strong></li>
                  <li>Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">Ctrl+V</kbd> to paste, convert &amp; download</li>
                </ol>
              </div>
              {launched && (
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 px-3 py-2.5 rounded-lg">
                  <ClipboardCheck className="w-4 h-4 flex-shrink-0" /><span>URL copied! Paste in {launched} tab</span>
                </div>
              )}
              <div className="space-y-3">
                {getConverters().map((svc) => (
                  <button key={svc.name} type="button" onClick={() => openConverter(svc)} className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-muted hover:border-primary/50 transition-all text-left group hover:shadow-md">
                    <div className={"w-12 h-12 rounded-lg flex items-center justify-center text-white flex-shrink-0 " + svc.color}>
                      {svc.icon === 'download' && <Download className="w-6 h-6" />}
                      {svc.icon === 'zap' && <Zap className="w-6 h-6" />}
                      {svc.icon === 'video' && <Video className="w-6 h-6" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{svc.name}</span>
                        {svc.recommended && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">Best</span>}
                        {svc.name === favorite && <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{svc.desc}</p>
                      {svc.note && <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">{svc.note}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      <button onClick={(e) => { e.stopPropagation(); toggleFav(svc.name); }} className="p-1 rounded hover:bg-muted transition-colors" title="Favorite">
                        <Star className={`w-3.5 h-3.5 ${svc.name === favorite ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground'}`} />
                      </button>
                    </div>
                  </button>
                ))}
              </div>
              <div className="border-t pt-3 mt-1"><p className="text-[11px] text-muted-foreground flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3" />Star a converter to pin it. If one fails, try another.</p></div>
            </CardContent></Card>
          </>
        )}

        {phase === 'error' && (
          <Card><CardContent className="p-6 space-y-4">
            <div className="flex items-start gap-2 text-destructive"><XCircle className="w-5 h-5 mt-0.5 flex-shrink-0" /><p className="text-sm">{error}</p></div>
            <Button variant="outline" onClick={handleReset} className="gap-2"><AlertCircle className="w-4 h-4" />Try Again</Button>
          </CardContent></Card>
        )}

        {phase === 'input' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
            {[
              { icon: <Music className="w-5 h-5 text-primary" />, t: 'Audio', d: 'Convert to MP3 from any platform.' },
              { icon: <Video className="w-5 h-5 text-primary" />, t: 'Video', d: 'Download videos in MP4 format.' },
              { icon: <Zap className="w-5 h-5 text-primary" />, t: 'Fast & Easy', d: 'Paste link, pick converter, download.' },
            ].map(f => (
              <Card key={f.t} className="hover:shadow-md transition-shadow"><CardContent className="p-4 text-center">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-3">{f.icon}</div>
                <h3 className="font-semibold text-sm">{f.t}</h3>
                <p className="text-xs text-muted-foreground mt-1">{f.d}</p>
              </CardContent></Card>
            ))}
          </div>
        )}

        {phase === 'input' && (
          <div className="mt-8">
            <h3 className="text-sm font-semibold text-center mb-4 text-muted-foreground">Supported Platforms</h3>
            <div className="grid grid-cols-4 gap-3">
              <div className="flex flex-col items-center gap-2 group">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8Z" fill="white"/><path d="m9.75 15.02 5.75-3.02-5.75-3.02v6.04Z" fill="#FF0000"/></svg>
                </div>
                <p className="text-xs font-medium text-muted-foreground">YouTube</p>
              </div>
              <div className="flex flex-col items-center gap-2 group">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M11.56 8.87V17h8.76c.58 0 1.07-.5.93-1.07-.69-2.86-2.66-5.25-5.36-6.59a6.96 6.96 0 0 0-4.33-.47Z" fill="white"/><path d="M11.56 3.47c-3.6 0-6.84 1.5-9.16 3.9a.75.75 0 0 0 .04 1.08c2.6 2.22 5.97 3.57 9.12 3.57V3.47Z" fill="white" opacity=".6"/><path d="M1.83 15.4c-.45-.18-.83.33-.58.72A11.55 11.55 0 0 0 11.56 21V12.5c-3.35 0-6.92 1.19-9.73 2.9Z" fill="white" opacity=".9"/></svg>
                </div>
                <p className="text-xs font-medium text-muted-foreground">SoundCloud</p>
              </div>
              <div className="flex flex-col items-center gap-2 group">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-gray-800 to-black flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </div>
                <p className="text-xs font-medium text-muted-foreground">X</p>
              </div>
              <div className="flex flex-col items-center gap-2 group">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-pink-500 via-purple-500 to-orange-400 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="5" stroke="white" strokeWidth="2"/><circle cx="12" cy="12" r="5" stroke="white" strokeWidth="2"/><circle cx="17.5" cy="6.5" r="1.5" fill="white"/></svg>
                </div>
                <p className="text-xs font-medium text-muted-foreground">Instagram</p>
              </div>
            </div>
          </div>
        )}

        {phase === 'input' && history.length > 0 && (
          <Card className="mt-4"><CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2"><Clock className="w-4 h-4" />Recent</h3>
              <button onClick={clearHist} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors"><Trash2 className="w-3 h-3" />Clear</button>
            </div>
            <div className="space-y-2">
              {history.slice(0, 4).map((h, i) => (
                <button key={i} type="button" onClick={() => setUrl(h.url)} className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors text-left">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${pBadge(h.platform)}`}>
                    <span className="text-[8px] font-bold text-white">{pLabel(h.platform).charAt(0)}</span>
                  </div>
                  <span className="text-xs text-muted-foreground truncate flex-1">{h.title}</span>
                </button>
              ))}
            </div>
          </CardContent></Card>
        )}
      </main>

      <footer className="border-t py-4 mt-auto">
        <div className="max-w-3xl mx-auto px-4 text-center text-xs text-muted-foreground">
          YT Convert &mdash; YouTube, SoundCloud, X &amp; Instagram converter. For personal use only.
        </div>
      </footer>
    </div>
  );
}
