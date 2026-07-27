'use client';
import { useState, useCallback, useEffect } from 'react';
import { Download, Music, Video, Link2, Loader2, XCircle, ArrowRight, Zap, ExternalLink, Play, Info, CheckCircle2, Sun, Moon } from 'lucide-react';

function getId(u: string) { const m = u.match(/(?:v=|youtu\.be\/|shorts\/|live\/)([a-zA-Z0-9_-]{11})/); return m ? m[1] : null; }

export default function Home() {
  const [url, setUrl] = useState('');
  const [fmt, setFmt] = useState('video');
  const [phase, setPhase] = useState('input');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [dk, setDk] = useState(false);
  useEffect(() => { const v = localStorage.getItem('dk') === '1'; setDk(v); document.documentElement.classList.toggle('dark', v); }, []);
  const toggleDk = () => { const n = !dk; setDk(n); localStorage.setItem('dk', n ? '1' : '0'); document.documentElement.classList.toggle('dark', n); };
  const fetchInfo = useCallback(async () => {
    if (!url.trim() || !getId(url.trim())) { setErr('Invalid YouTube URL'); setPhase('error'); return; }
    setErr(''); setPhase('loading'); setInfo(null); setCopied(false);
    try {
      const r = await fetch('/api/video-info?url=' + encodeURIComponent(url.trim()));
      if (!r.ok) throw new Error('Video not found');
      const d = await r.json();
      setInfo(d); setPhase('ready');
    } catch (e: any) { setErr(e.message); setPhase('error'); }
  }, [url]);
  const vid = info ? getId(url.trim()) : null;
  const cvts = [
    { n: 'Y2Mate', u: 'https://v27.www-y2mate.com/', d: 'MP4 144p-1080p, MP3 128-320kbps', c: 'bg-rose-600', i: 'd', b: true },
    { n: 'Y2Mate alt', u: 'https://en.y2mate.so/youtube-converter/', d: 'Alternate Y2Mate domain', c: 'bg-orange-600', i: 'z', b: false },
    { n: 'AudioConverter', u: 'https://audioconverter.ai/youtube-to-mp4-converter', d: 'MP4 HD and 4K', c: 'bg-sky-600', i: 'v', b: false },
    { n: 'Hicoo', u: 'https://hicoo.ai/mp4-converter/youtube-to-mp4', d: 'MP4 360p to 4K', c: 'bg-emerald-600', i: 'z', b: false },
  ];
  const go = (x: typeof cvts[0]) => {
    navigator.clipboard.writeText(url.trim()).then(() => setCopied(true)).catch(() => {});
    window.open(x.u, '_blank');
  };
  if (phase === 'loading') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
    </div>
  );
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors">
      <header className="border-b dark:border-gray-700 bg-white dark:bg-gray-800 sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 flex items-center justify-center"><Video className="w-5 h-5" /></div>
          <div className="flex-1"><h1 className="text-lg font-bold">YT Convert</h1><p className="text-xs text-gray-500 dark:text-gray-400">YouTube to MP3 & MP4</p></div>
          <button onClick={toggleDk} className="w-10 h-10 rounded-xl border dark:border-gray-600 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">{dk ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}</button>
        </div>
      </header>
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 space-y-5">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 dark:border-gray-700 p-5 space-y-4">
          <label className="text-sm font-medium block">YouTube URL</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="url" placeholder="https://www.youtube.com/watch?v=..." value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchInfo()} className="w-full pl-10 pr-3 py-3 border-2 dark:border-gray-600 rounded-xl text-base bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-gray-900 dark:focus:border-gray-400" />
            </div>
            {(phase === 'input' || phase === 'error') && <button onClick={fetchInfo} disabled={!url.trim()} className="px-5 py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-medium disabled:opacity-40"><ArrowRight className="w-4 h-4 inline" /> Go</button>}
          </div>
          {phase === 'input' && (
            <div className="flex gap-2">
              <button onClick={() => setFmt('audio')} className={"flex-1 py-2.5 rounded-xl text-sm font-medium border-2 flex items-center justify-center gap-2 " + (fmt === 'audio' ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white' : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600')}><Music className="w-4 h-4" />MP3</button>
              <button onClick={() => setFmt('video')} className={"flex-1 py-2.5 rounded-xl text-sm font-medium border-2 flex items-center justify-center gap-2 " + (fmt === 'video' ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white' : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600')}><Video className="w-4 h-4" />MP4</button>
            </div>
          )}
        </div>
        {phase === 'error' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 dark:border-gray-700 p-5 space-y-3">
            <p className="text-red-600 dark:text-red-400 text-sm flex items-center gap-2"><XCircle className="w-4 h-4" />{err}</p>
            <button onClick={() => { setPhase('input'); setErr(''); }} className="text-sm border dark:border-gray-600 rounded-lg px-4 py-2">Try Again</button>
          </div>
        )}
        {phase === 'ready' && info && vid && (
          <>
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 dark:border-gray-700 p-4 space-y-2">
              <div className="relative rounded-xl overflow-hidden bg-black cursor-pointer" onClick={() => window.open('https://www.youtube.com/watch?v=' + vid, '_blank')}>
                <img src={info.thumbnail} alt="" className="w-full" style={{ maxHeight: 300 }} />
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center"><Play className="w-12 h-12 text-white" fill="white" /></div>
              </div>
              <h3 className="font-semibold text-sm">{info.title}</h3>
              {info.author && <p className="text-xs text-gray-500 dark:text-gray-400">{info.author}</p>}
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 dark:border-gray-700 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Download as {fmt === 'audio' ? 'MP3' : 'MP4'}</h2>
                <button onClick={() => { setPhase('input'); setInfo(null); setCopied(false); }} className="text-xs text-gray-500 dark:text-gray-400 border dark:border-gray-600 rounded-lg px-3 py-1">New</button>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-3 text-xs text-gray-600 dark:text-gray-300">
                <p className="font-medium text-gray-900 dark:text-gray-100 mb-1"><Info className="w-3.5 h-3.5 inline" /> How to download:</p>
                <ol className="list-decimal list-inside space-y-0.5"><li>Tap a converter below</li><li>Your URL is auto-copied - paste it</li><li>Pick quality and download</li></ol>
              </div>
              {copied && <div className="text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-3 py-2 rounded-lg"><CheckCircle2 className="w-4 h-4 inline" /> URL copied!</div>}
              <div className="space-y-2">
                {cvts.map(x => (
                  <button key={x.n} onClick={() => go(x)} className="w-full flex items-center gap-3 p-3.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 text-left transition-colors">
                    <div className={"w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0 " + x.c}>
                      {x.i === 'd' && <Download className="w-5 h-5" />}{x.i === 'z' && <Zap className="w-5 h-5" />}{x.i === 'v' && <Video className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0"><div className="flex items-center gap-1.5"><span className="font-semibold text-sm">{x.n}</span>{x.b && <span className="text-[10px] bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">Best</span>}</div><p className="text-xs text-gray-500 dark:text-gray-400">{x.d}</p></div>
                    <ExternalLink className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        {phase === 'input' && (
          <div className="grid grid-cols-3 gap-3">
            {[{ i: Music, t: 'Audio', d: 'Convert to MP3' }, { i: Video, t: 'Video', d: 'Download MP4' }, { i: Zap, t: 'Fast', d: 'Paste & go' }].map(f => (
              <div key={f.t} className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-3 text-center"><div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center mx-auto mb-2"><f.i className="w-4 h-4 text-gray-700 dark:text-gray-300" /></div><h3 className="font-semibold text-sm">{f.t}</h3><p className="text-[11px] text-gray-500 dark:text-gray-400">{f.d}</p></div>
            ))}
          </div>
        )}
      </main>
      <footer className="border-t dark:border-gray-700 py-3 mt-auto text-center text-xs text-gray-400 dark:text-gray-500">YT Convert - For personal use only</footer>
    </div>
  );
                }
