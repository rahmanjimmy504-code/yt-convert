'use client';

import { useState, useCallback } from 'react';
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

/* ── helpers ── */
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
function platformLabel(p: string | null) {
  if (p === 'youtube') return 'YouTube';
  if (p === 'soundcloud') return 'SoundCloud';
  if (p === 'twitter') return 'X / Twitter';
  if (p === 'instagram') return 'Instagram';
  return 'Supported Platform';
}
function platformColor(p: string | null) {
  if (p === 'youtube') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  if (p === 'soundcloud') return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
  if (p === 'twitter') return 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400';
  if (p === 'instagram') return 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400';
  return 'bg-muted text-muted-foreground';
}
function platformIconUrl(p: string | null) {
  if (p === 'youtube') return 'https://www.google.com/s2/favicons?domain=youtube.com&sz=64';
  if (p === 'soundcloud') return 'https://www.google.com/s2/favicons?domain=soundcloud.com&sz=64';
  if (p === 'twitter') return 'https://www.google.com/s2/favicons?domain=x.com&sz=64';
  if (p === 'instagram') return 'https://www.google.com/s2/favicons?domain=instagram.com&sz=64';
  return '';
}

type Phase = 'input' | 'loading' | 'ready' | 'error';

interface VideoInfo {
  title: string;
  author: string;
  thumbnail: string;
  duration?: string;
  views?: string;
  published?: string;
  platform?: string;
}

interface ConverterService {
  name: string;
  url: string;
  desc: string;
  color: string;
  icon: 'download' | 'zap' | 'video';
  platform: string[];
  recommended?: boolean;
  note?: string;
}

interface HistoryItem {
  title: string;
  url: string;
  platform: string;
  time: number;
}

/* ── rotating tips ── */
const tips = [
  'Paste any YouTube, SoundCloud, X, or Instagram link to get started.',
  'Your URL is auto-copied when you click a converter.',
  'If one converter has ads, try another — they all work!',
  'All converters are free and require no sign-up.',
  'Press Enter after pasting your URL to fetch info instantly.',
];

export default function Home() {
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState<'audio' | 'video'>('video');
  const [phase, setPhase] = useState<Phase>('input');
  const [error, setError] = useState('');
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [launched, setLaunched] = useState<string | null>(null);
  const [tipIndex, setTipIndex] = useState(0);
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem('yt-convert-history') || '[]'); } catch { return []; }
  });
  const [favorite, setFavorite] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('yt-convert-fav') || '';
  });
  const { toast } = useToast();

  // rotate tips
  useState(() => {
    const i = setInterval(() => setTipIndex(t => (t + 1) % tips.length), 5000);
    return () => clearInterval(i);
  });

  const detectedPlatform = url.trim() ? getPlatform(url.trim()) : null;

  const handleGetInfo = useCallback(async () => {
    if (!url.trim()) { toast({ title: 'Enter a URL', variant: 'destructive' }); return; }
    const plat = getPlatform(url.trim());
    if (!plat) { toast({ title: 'Unsupported URL', description: 'Paste a YouTube, SoundCloud, X, or Instagram link.', variant: 'destructive' }); return; }
    setError('');
    setPhase('loading');
    setVideoInfo(null);
    setLaunched(null);
    try {
      const resp = await fetch('/api/video-info?url=' + encodeURIComponent(url.trim()));
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to load info');
      }
      const data = await resp.json();
      const thumb = plat === 'youtube' && extractVideoId(url.trim())
        ? `https://i.ytimg.com/vi/${extractVideoId(url.trim())}/hqdefault.jpg`
        : (data.thumbnail || '');
      setVideoInfo({
        title: data.title || 'Unknown',
        author: data.author || '',
        thumbnail: thumb,
        duration: data.duration || '',
        views: data.views || '',
        published: data.published || '',
        platform: data.platform || plat,
      });
      // save to history
      const newItem: HistoryItem = { title: data.title || 'Unknown', url: url.trim(), platform: plat, time: Date.now() };
      const h = [newItem, ...history.filter(x => x.url !== url.trim())].slice(0, 6);
      setHistory(h);
      try { localStorage.setItem('yt-convert-history', JSON.stringify(h)); } catch {}
      setPhase('ready');
    } catch (e: any) {
      setError(e.message || 'Failed to load info.');
      setPhase('error');
    }
  }, [url, toast, history]);

  const videoId = videoInfo ? extractVideoId(url.trim()) : null;

  const allConverters: ConverterService[] = [
    { name: 'Y2Mate', url: 'https://v27.www-y2mate.com/', desc: 'MP4 (144p-1080p) & MP3 (128-320kbps). No sign-up.', color: 'bg-rose-600 hover:bg-rose-700', icon: 'download', platform: ['youtube'], recommended: true },
    { name: 'Y2Mate (alt)', url: 'https://en.y2mate.so/youtube-converter/', desc: 'Alt Y2Mate domain. May show verification.', color: 'bg-orange-600 hover:bg-orange-700', icon: 'zap', platform: ['youtube'], note: 'May need Cloudflare check' },
    { name: 'AudioConverter', url: 'https://audioconverter.ai/youtube-to-mp4-converter', desc: 'YouTube to MP4. Supports HD and 4K.', color: 'bg-sky-600 hover:bg-sky-700', icon: 'video', platform: ['youtube'] },
    { name: 'Hicoo', url: 'https://hicoo.ai/mp4-converter/youtube-to-mp4', desc: 'YouTube to MP4. 360p to 4K UHD.', color: 'bg-emerald-600 hover:bg-emerald-700', icon: 'zap', platform: ['youtube'] },
    { name: 'KlickAud', url: 'https://www.klickaud.co/', desc: 'SoundCloud to MP3. Fast and simple.', color: 'bg-orange-500 hover:bg-orange-600', icon: 'download', platform: ['soundcloud'], recommended: true },
    { name: 'SC Downloader', url: 'https://soundcloudmp3.org/', desc: 'Download SoundCloud tracks as MP3.', color: 'bg-amber-600 hover:bg-amber-700', icon: 'zap', platform: ['soundcloud'] },
    { name: 'SSSTik', url: 'https://ssstik.io/', desc: 'Download X/Twitter videos. No watermark.', color: 'bg-sky-500 hover:bg-sky-600', icon: 'download', platform: ['twitter'], recommended: true },
    { name: 'Twitsave', url: 'https://twitsave.com/', desc: 'Save X/Twitter videos in HD.', color: 'bg-indigo-600 hover:bg-indigo-700', icon: 'video', platform: ['twitter'] },
    { name: 'SaveInsta', url: 'https://www.saveinsta.app/', desc: 'Download Instagram photos & videos.', color: 'bg-pink-500 hover:bg-pink-600', icon: 'download', platform: ['instagram'], recommended: true },
    { name: 'iGram', url: 'https://igram.io/', desc: 'Instagram downloader for reels & stories.', color: 'bg-purple-600 hover:bg-purple-700', icon: 'zap', platform: ['instagram'] },
  ];

  const getConverters = useCallback((): ConverterService[] => {
    const plat = videoInfo?.platform || getPlatform(url.trim());
    if (!plat) return allConverters.slice(0, 4);
    const filtered = allConverters.filter(c => c.platform.includes(plat));
    // sort: favorite first, then recommended
    return filtered.sort((a, b) => {
      if (a.name === favorite) return -1;
      if (b.name === favorite) return 1;
      if (a.recommended && !b.recommended) return -1;
      if (!a.recommended && b.recommended) return 1;
      return 0;
    });
  }, [videoInfo, url, favorite]);

  const openConverter = useCallback((converter: ConverterService) => {
    navigator.clipboard.writeText(url.trim()).then(() => {
      toast({ title: 'URL copied!', description: 'Go to the converter tab and press Ctrl+V to paste.', duration: 8000 });
      setLaunched(converter.name);
    }).catch(() => {
      toast({ title: 'Open converter', description: 'Copy the URL manually and paste on the converter page.', duration: 6000 });
      setLaunched(converter.name);
    });
    window.open(converter.url, '_blank', 'noopener');
  }, [url, toast]);

  const toggleFavorite = useCallback((name: string) => {
    const next = favorite === name ? '' : name;
    setFavorite(next);
    try { localStorage.setItem('yt-convert-fav', next); } catch {}
  }, [favorite]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    try { localStorage.removeItem('yt-convert-history'); } catch {}
  }, []);

  const handleReset = useCallback(() => { setPhase('input'); setError(''); setVideoInfo(null); setLaunched(null); }, []);
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => { if (e.key === 'Enter' && (phase === 'input' || phase === 'error')) handleGetInfo(); }, [phase, handleGetInfo]);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-muted/30">
      {/* Header */}
      <header className="border-b bg-background/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/20">
            <Video className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">YT Convert</h1>
            <p className="text-xs text-muted-foreground">YouTube &bull; SoundCloud &bull; X &bull; Instagram</p>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8 space-y-6">
        {/* URL Input Card */}
        <Card className="border-2 border-dashed border-muted-foreground/20 hover:border-primary/40 transition-colors">
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="url-input" className="text-sm font-medium">Paste any link</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="url-input" type="url"
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={url} onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={handleKeyDown} disabled={phase === 'loading'}
                    className="pl-10 h-12 text-base"
                  />
                </div>
                {(phase === 'input' || phase === 'error') && (
                  <Button onClick={handleGetInfo} disabled={!url.trim() || phase === 'loading'} className="h-12 px-6 gap-2 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-lg shadow-red-500/20">
                    <ArrowRight className="w-4 h-4" /> Go
                  </Button>
                )}
              </div>
              {detectedPlatform && phase === 'input' && (
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={platformIconUrl(detectedPlatform)} alt="" className="w-4 h-4 rounded-sm" />
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${platformColor(detectedPlatform)}`}>
                    {platformLabel(detectedPlatform)}
                  </span>
                </div>
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
            {/* Rotating tip */}
            {phase === 'input' && (
              <p className="text-xs text-muted-foreground text-center animate-pulse">{tips[tipIndex]}</p>
            )}
          </CardContent>
        </Card>

        {/* Loading */}
        {phase === 'loading' && (
          <Card className="border-2 border-primary/30">
            <CardContent className="p-8 text-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
              <p className="text-sm text-muted-foreground">Fetching info...</p>
              <div className="max-w-xs mx-auto space-y-2">
                <div className="h-3 bg-muted rounded animate-pulse" />
                <div className="h-3 bg-muted rounded w-3/4 animate-pulse" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Video Info + Converters */}
        {phase === 'ready' && videoInfo && (
          <>
            <Card className="border-2 border-primary/30 overflow-hidden">
              <CardContent className="p-6 space-y-4">
                {videoInfo.thumbnail && (
                  <div
                    className="relative rounded-xl overflow-hidden bg-black group cursor-pointer"
                    onClick={() => {
                      if (videoInfo.platform === 'youtube' && videoId) window.open('https://www.youtube.com/watch?v=' + videoId, '_blank', 'noopener');
                      else window.open(url.trim(), '_blank', 'noopener');
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={videoInfo.thumbnail} alt={videoInfo.title} className="w-full object-cover"
                      style={{ maxHeight: '360px' }}
                      onError={(e) => { const t = e.target as HTMLImageElement; if (videoId) t.src = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`; }}
                    />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center shadow-lg">
                        <Play className="w-7 h-7 text-white ml-1" fill="white" />
                      </div>
                    </div>
                    {videoInfo.duration && (
                      <span className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-0.5 rounded">{videoInfo.duration}</span>
                    )}
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
                  {videoInfo.platform && (
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${platformColor(videoInfo.platform)}`}>
                      {platformLabel(videoInfo.platform)}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Converter Buttons */}
            <Card className="border-2">
              <CardContent className="p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-lg">Converters</h2>
                  <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5 text-xs">
                    <ArrowRight className="w-3 h-3 rotate-180" /> New
                  </Button>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium"><Info className="w-4 h-4 text-primary" />How to download:</div>
                  <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside pl-1">
                    <li>Click a converter below — opens in a new tab</li>
                    <li>Your URL is <strong>auto-copied</strong> to clipboard</li>
                    <li>Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">Ctrl+V</kbd> to paste, then convert &amp; download</li>
                  </ol>
                </div>
                {launched && (
                  <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 px-3 py-2.5 rounded-lg">
                    <ClipboardCheck className="w-4 h-4 flex-shrink-0" />
                    <span>URL copied! Paste in {launched} tab with <kbd className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/50 rounded text-xs font-mono">Ctrl+V</kbd></span>
                  </div>
                )}
                <div className="space-y-3">
                  {getConverters().map((svc) => (
                    <button
                      key={svc.name} type="button" onClick={() => openConverter(svc)}
                      className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-muted hover:border-primary/50 transition-all text-left group hover:shadow-md"
                    >
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
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleFavorite(svc.name); }}
                          className="p-1 rounded hover:bg-muted transition-colors"
                          title={svc.name === favorite ? 'Unfavorite' : 'Set as favorite'}
                        >
                          <Star className={`w-3.5 h-3.5 ${svc.name === favorite ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground'}`} />
                        </button>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="border-t pt-3 mt-1">
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3" />Tip: Star a converter to pin it to the top. If one doesn&apos;t work, try another.
                  </p>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* Error */}
        {phase === 'error' && (
          <Card><CardContent className="p-6 space-y-4">
            <div className="flex items-start gap-2 text-destructive"><XCircle className="w-5 h-5 mt-0.5 flex-shrink-0" /><p className="text-sm">{error}</p></div>
            <Button variant="outline" onClick={handleReset} className="gap-2"><AlertCircle className="w-4 h-4" />Try Again</Button>
          </CardContent></Card>
        )}

        {/* Initial Features */}
        {phase === 'input' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
            {[
              { icon: <Music className="w-5 h-5 text-primary" />, title: 'Audio', desc: 'Convert to MP3 audio from any platform.' },
              { icon: <Video className="w-5 h-5 text-primary" />, title: 'Video', desc: 'Download videos in MP4 format.' },
              { icon: <Zap className="w-5 h-5 text-primary" />, title: 'Fast & Easy', desc: 'Paste link, pick converter, download.' },
            ].map(f => (
              <Card key={f.title} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 text-center">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-3">{f.icon}</div>
                  <h3 className="font-semibold text-sm">{f.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Supported Platforms */}
        {phase === 'input' && (
          <div className="mt-8">
            <h3 className="text-sm font-semibold text-center mb-4 text-muted-foreground">Supported Platforms</h3>
            <div className="grid grid-cols-4 gap-3">
              {[
                { name: 'YouTube', gradient: 'from-red-500 to-red-600', domain: 'youtube.com' },
                { name: 'SoundCloud', gradient: 'from-orange-400 to-orange-600', domain: 'soundcloud.com' },
                { name: 'X', gradient: 'from-gray-700 to-gray-900', domain: 'x.com' },
                { name: 'Instagram', gradient: 'from-pink-500 to-purple-600', domain: 'instagram.com' },
              ].map(p => (
                <div key={p.name} className="flex flex-col items-center gap-2 group">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${p.gradient} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${p.domain}&sz=64`}
                      alt={p.name}
                      className="w-8 h-8 rounded-lg bg-white/20 p-1"
                    />
                  </div>
                  <p className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">{p.name}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* History */}
        {phase === 'input' && history.length > 0 && (
          <Card className="mt-4">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2"><Clock className="w-4 h-4" />Recent</h3>
                <button onClick={clearHistory} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors">
                  <Trash2 className="w-3 h-3" />Clear
                </button>
              </div>
              <div className="space-y-2">
                {history.slice(0, 4).map((h, i) => (
                  <button
                    key={i} type="button"
                    onClick={() => { setUrl(h.url); }}
                    className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors text-left group"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={platformIconUrl(h.platform)} alt="" className="w-4 h-4 rounded-sm flex-shrink-0" />
                    <span className="text-xs text-muted-foreground truncate flex-1">{h.title}</span>
                    <span className="text-[10px] text-muted-foreground/60 flex-shrink-0">{new Date(h.time).toLocaleDateString()}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      <footer className="border-t py-4 mt-auto">
        <div className="max-w-3xl mx-auto px-4 text-center text-xs text-muted-foreground">
          YT Convert — YouTube, SoundCloud, X &amp; Instagram converter. For personal use only.
        </div>
      </footer>
    </div>
  );
}
