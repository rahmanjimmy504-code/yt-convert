'use client';
import { useState, useCallback } from 'react';
import { Download, Music, Video, Link2, Loader2, XCircle, ArrowRight, Zap, ExternalLink, Play, Info, CheckCircle2 } from 'lucide-react';

function extractVideoId(url: string): string | null {
  const m = url.match(/(?:v=|youtu\.be\/|shorts\/|live\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState<'audio' | 'video'>('video');
  const [phase, setPhase] = useState<'input' | 'loading' | 'ready' | 'error'>('input');
  const [error, setError] = useState('');
  const [videoInfo, setVideoInfo] = useState<{ title: string; author: string; thumbnail: string } | null>(null);
  const [launched, setLaunched] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGetInfo = useCallback(async () => {
    if (!url.trim()) return;
    const vid = extractVideoId(url.trim());
    if (!vid) { setError('Invalid YouTube URL'); setPhase('error'); return; }
    setError(''); setPhase('loading'); setVideoInfo(null); setLaunched(null); setCopied(false);
    try {
      const resp = await fetch('/api/video-info?url=' + encodeURIComponent(url.trim()));
      if (!resp.ok) { const d = await resp.json().catch(() => ({})); throw new Error(d.error || 'Failed'); }
      const data = await resp.json();
      setVideoInfo({ title: data.title, author: data.author, thumbnail: data.thumbnail });
      setPhase('ready');
    } catch (e: any) { setError(e.message || 'Failed to load video info.'); setPhase('error'); }
  }, [url]);

  const videoId = videoInfo ? extractVideoId(url.trim()) : null;

  const converters = [
    { name: 'Y2Mate', url: 'https://v27.www-y2mate.com/', desc: 'MP4 (144p-1080p) & MP3 (128-320kbps)', color: 'bg-rose-600', icon: 'download', best: true },
    { name: 'Y2Mate alt', url: 'https://en.y2mate.so/youtube-converter/', desc: 'Alternate Y2Mate domain', color: 'bg-orange-600', icon: 'zap', best: false },
    { name: 'AudioConverter', url: 'https://audioconverter.ai/youtube-to-mp4-converter', desc: 'MP4 with HD and 4K', color: 'bg-sky-600', icon: 'video', best: false },
    { name: 'Hicoo', url: 'https://hicoo.ai/mp4-converter/youtube-to-mp4', desc: 'MP4 quality: 360p to 4K', color: 'bg-emerald-600', icon: 'zap', best: false },
  ];

  const openConverter = useCallback((c: typeof converters[0]) => {
    navigator.clipboard.writeText(url.trim()).then(() => { setCopied(true); set
