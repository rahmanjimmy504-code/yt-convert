'use client';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Download, Music, Video, Link2, Loader2, XCircle, ArrowRight, Zap, ExternalLink, Play, Info, CheckCircle2, Sun, Moon, AlertCircle, Clock, Eye, Calendar } from 'lucide-react';

interface VideoInfo {
  title: string;
  author: string;
  thumbnail: string;
  duration?: number;
  views?: string;
  uploadDate?: string;
}

function getId(u: string) {
  const m = u.match(/(?:v=|youtu\.be\/|shorts\/|live\/|embed\/|clip\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function isValidYouTubeUrl(url: string): boolean {
  if (!url.trim()) return false;
  return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)/.test(url) && getId(url) !== null;
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [fmt, setFmt] = useState<'audio' | 'video'>('video');
  const [phase, setPhase] = useState<'input' | 'loading' | 'ready' | 'error'>('input');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [dk, setDk] = useState(false);
  const [launched, setLaunched] = useState<string | null>(null);
  const [urlError, setUrlError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const cvts = useMemo(() => [
    { n: '9Convert', u: 'https://9convert.org/', d: 'MP4 144p-1080p, MP3 128-320kbps', c: 'bg-rose-600', i: 'd', b: true },
    { n: 'Y2Mate alt', u: 'https://en.y2mate.so/youtube-converter/', d: 'Alternate Y2Mate domain', c: 'bg-orange-600', i: 'z', b: false },
    { n: 'AudioConverter', u: 'https://audioconverter.ai/youtube-to-mp4-converter', d: 'MP4 HD and 4K', c: 'bg-sky-600', i: 'v', b: false },
    { n: 'Hicoo', u: 'https://hicoo.ai/mp4-converter/youtube-to-mp4', d: 'MP4 360p to 4K', c: 'bg-emerald-600', i: 'z', b: false },
  ], []);

  useEffect(() => {
    try {
      const v = localStorage.getItem('dk') === '1';
      setDk(v);
      document.documentElement.classList.toggle('dark', v);
    } catch {}
    inputRef.current?.focus();
  }, []);

  const toggleDk = () => {
    const n = !dk;
    setDk(n);
    try {
      localStorage.setItem('dk', n ? '1' : '0');
    } catch {}
    document.documentElement.classList.toggle('dark', n);
  };

  const handleUrlChange = (value: string) => {
    setUrl(value);
    if (value.trim() && !isValidYouTubeUrl(value)) {
      setUrlError('Invalid YouTube URL format');
    } else {
      setUrlError('');
    }
  };

  const fetchInfo = useCallback(async () => {
    const t = url.trim();
    if (!t || !getId(t)) {
      setErr('Invalid YouTube URL');
      setPhase('error');
      return;
    }
    setErr('');
    setPhase('loading');
    setInfo(null);
    setCopied(false);
    setLaunched(null);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const timer = setTimeout(() => ac.abort(), 10000);
    try {
      const r = await fetch('/api/video-info?url=' + encodeURIComponent(t), { signal: ac.signal });
      clearTimeout(timer);
      if (!r.ok) throw new Error('Video not found or is unavailable');
      const d = await r.json();
      if (!d?.title) throw new Error('Could not load video info');
      setInfo({
        title: String(d.title),
        author: String(d.author || 'Unknown'),
        thumbnail: String(d.thumbnail || ''),
        duration: d.duration,
        views: d.views,
        uploadDate: d.uploadDate,
      });
      setPhase('ready');
    } catch (e: any) {
      clearTimeout(timer);
      if (e.name === 'AbortError') {
        setErr('Request timed out. Please try again.');
      } else if (e.message.includes('not found')) {
        setErr('Video not found. Check the URL and try again.');
      } else if (e.message.includes('Private')) {
        setErr('This video is private or restricted.');
      } else {
        setErr(e.message || 'Something went wrong. Please try again.');
      }
      setPhase('error');
    }
  }, [url]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && isValidYouTubeUrl(url)) {
      fetchInfo();
    } else if (e.key === 'Escape') {
      setUrl('');
      setUrlError('');
      inputRef.current?.focus();
    }
  };

  const vid = info ? getId(url.trim()) : null;

  const go = useCallback(
    (x: (typeof cvts)[0]) => {
      if (launched === x.n) return;
      setLaunched(x.n);
      navigator.clipboard
        .writeText(url.trim())
        .then(() => {
          setCopied(true);
          if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
          copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
        })
        .catch(() => {});
      window.open(x.u, '_blank', 'noopener,noreferrer');
    },
    [url, launched, cvts]
  );

  const selectInput = () => inputRef.current?.select();

  if (phase === 'loading')
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900" role="status" aria-label="Loading video info">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-sm text-gray-600 dark:text-gray-400">Fetching video info...</p>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors">
      <header className="border-b dark:border-gray-700 bg-white dark:bg-gray-800 sticky top-0 z-50 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white flex items-center justify-center shadow-md">
            <Video className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-bold">YT Convert</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">YouTube to MP3 & MP4</p>
          </div>
          <button
            onClick={toggleDk}
            aria-label={dk ? 'Switch to light mode' : 'Switch to dark mode'}
            className="w-10 h-10 rounded-xl border dark:border-gray-600 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            {dk ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>
      </header>
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 space-y-5">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 dark:border-gray-700 p-5 space-y-4 shadow-sm">
          <label htmlFor="yt-url" className="text-sm font-medium block">
            YouTube URL
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={inputRef}
                id="yt-url"
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={url}
                onChange={(e) => handleUrlChange(e.target.value)}
                onFocus={selectInput}
                onKeyDown={handleKeyDown}
                className={`w-full pl-10 pr-4 py-3 rounded-xl border-2 bg-gray-50 dark:bg-gray-700 transition-all ${
                  urlError
                    ? 'border-red-500 dark:border-red-400'
                    : url && isValidYouTubeUrl(url)
                    ? 'border-green-500 dark:border-green-400'
                    : 'border-gray-200 dark:border-gray-600'
                } focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
                aria-invalid={urlError ? 'true' : 'false'}
              />
            </div>
            {(phase === 'input' || phase === 'error') && (
              <button
                onClick={fetchInfo}
                disabled={!url.trim() || !!urlError}
                className="px-5 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg transition-all active:scale-95"
                aria-label="Fetch video information"
              >
                Go
              </button>
            )}
          </div>
          {urlError && (
            <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {urlError}
            </p>
          )}
          {phase === 'input' && (
            <div className="flex gap-2">
              <button
                onClick={() => setFmt('audio')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 flex items-center justify-center gap-2 transition-all ${
                  fmt === 'audio'
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:border-blue-300'
                }`}
              >
                <Music className="w-4 h-4" /> MP3
              </button>
              <button
                onClick={() => setFmt('video')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 flex items-center justify-center gap-2 transition-all ${
                  fmt === 'video'
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:border-blue-300'
                }`}
              >
                <Video className="w-4 h-4" /> MP4
              </button>
            </div>
          )}
        </div>
        {phase === 'error' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 dark:border-gray-700 p-5 space-y-3 shadow-sm" role="alert">
            <p className="text-red-600 dark:text-red-400 text-sm flex items-center gap-2">
              <XCircle className="w-4 h-4 flex-shrink-0" />
              {err}
            </p>
            <button
              onClick={() => {
                setPhase('input');
                setErr('');
                inputRef.current?.focus();
              }}
              className="text-sm border dark:border-gray-600 rounded-lg px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}
        {phase === 'ready' && info && vid && (
          <>
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 dark:border-gray-700 p-4 space-y-3 shadow-sm">
              <div
                className="relative rounded-xl overflow-hidden bg-black cursor-pointer group"
                onClick={() => window.open('https://www.youtube.com/watch?v=' + vid, '_blank', 'noopener,noreferrer')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && window.open('https://www.youtube.com/watch?v=' + vid, '_blank', 'noopener,noreferrer')}
                aria-label="Watch on YouTube"
              >
                {info.thumbnail ? (
                  <img src={info.thumbnail} alt={info.title} className="w-full" style={{ maxHeight: 300 }} loading="lazy" />
                ) : (
                  <div className="w-full h-40 bg-gray-300 dark:bg-gray-700 animate-pulse" />
                )}
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/40 transition-colors">
                  <Play className="w-12 h-12 text-white group-hover:scale-110 transition-transform" fill="white" />
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-sm line-clamp-2">{info.title}</h3>
                {info.author && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{info.author}</p>}
              </div>
              {(info.duration || info.views || info.uploadDate) && (
                <div className="flex flex-wrap gap-3 text-xs text-gray-600 dark:text-gray-400 pt-2 border-t dark:border-gray-700">
                  {info.duration && (
                    <div className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{info.duration}</span>
                    </div>
                  )}
                  {info.views && (
                    <div className="flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5" />
                      <span>{info.views}</span>
                    </div>
                  )}
                  {info.uploadDate && (
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{info.uploadDate}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 dark:border-gray-700 p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Download as {fmt === 'audio' ? 'MP3' : 'MP4'}</h2>
                <button
                  onClick={() => {
                    setPhase('input');
                    setInfo(null);
                    setCopied(false);
                    setLaunched(null);
                    setUrl('');
                    setUrlError('');
                    inputRef.current?.focus();
                  }}
                  className="text-xs text-gray-500 dark:text-gray-400 border dark:border-gray-600 rounded-lg px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  aria-label="Start over with a new URL"
                >
                  ← New URL
                </button>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3 text-xs text-blue-900 dark:text-blue-200">
                <p className="font-medium flex items-center gap-2 mb-2">
                  <Info className="w-3.5 h-3.5 flex-shrink-0" />
                  How to download:
                </p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Tap a converter below</li>
                  <li>Your URL is auto-copied - paste it</li>
                  <li>Pick quality and download</li>
                </ol>
              </div>
              {copied && (
                <div role="status" aria-live="polite" className="text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-3 py-2 rounded-lg flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  URL copied to clipboard!
                </div>
              )}
              <div className="space-y-2">
                {cvts.map((x) => (
                  <button
                    key={x.n}
                    onClick={() => go(x)}
                    aria-label={`Open ${x.n} - ${x.d}`}
                    className="w-full flex items-center gap-3 p-3.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-500 transition-all active:scale-95"
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0 shadow-md ${x.c}`}>
                      {x.i === 'd' && <Download className="w-5 h-5" />}
                      {x.i === 'z' && <Zap className="w-5 h-5" />}
                      {x.i === 'v' && <Video className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm">{x.n}</span>
                        {x.b && <span className="text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded font-medium">Recommended</span>}
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-1">{x.d}</p>
                    </div>
                    {launched === x.n ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    ) : (
                      <ExternalLink className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0 group-hover:text-blue-500" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        {phase === 'input' && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { i: Music, t: 'Audio', d: 'Convert to MP3' },
              { i: Video, t: 'Video', d: 'Download MP4' },
              { i: Zap, t: 'Fast', d: 'Paste & go' },
            ].map((f) => (
              <div key={f.t} className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-3 text-center hover:shadow-md transition-shadow shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center mx-auto mb-2">
                  <f.i className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <p className="text-xs font-medium">{f.t}</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{f.d}</p>
              </div>
            ))}
          </div>
        )}
      </main>
      <footer className="border-t dark:border-gray-700 py-3 mt-auto text-center text-xs text-gray-500 dark:text-gray-400">YT Convert - For personal use only</footer>
    </div>
  );
}