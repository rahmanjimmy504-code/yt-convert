'use client';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Download, Music, Video, Link2, Loader2, XCircle, ArrowRight, Zap, ExternalLink, Play, Info, CheckCircle2, Sun, Moon, Check } from 'lucide-react';

function getId(u: string) { const m = u.match(/(?:v=|youtu\.be\/|shorts\/|live\/|embed\/|clip\/)([a-zA-Z0-9_-]{11})/); return m ? m[1] : null; }
function fD(s: number) { if (!s) return ''; const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sc = s%60; return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(sc).padStart(2,'0')}` : `${m}:${String(sc).padStart(2,'0')}`; }
function fV(n: number) { if (!n) return ''; if (n >= 1e9) return (n/1e9).toFixed(1).replace(/\.0$/,'')+'B views'; if (n >= 1e6) return (n/1e6).toFixed(1).replace(/\.0$/,'')+'M views'; if (n >= 1e3) return (n/1e3).toFixed(1).replace(/\.0$/,'')+'K views'; return n.toLocaleString()+' views'; }
function fT(ts: number) { if (!ts) return ''; return new Date(ts*1000).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'}); }

const CVTS = [
  { n: '9Convert', u: 'https://9convert.org/', d: 'MP4 144p-1080p, MP3 128-320kbps', c: 'bg-rose-600', i: 'd', b: true },
  { n: 'Y2Mate alt', u: 'https://en.y2mate.so/youtube-converter/', d: 'Alternate Y2Mate domain', c: 'bg-orange-600', i: 'z', b: false },
  { n: 'AudioConverter', u: 'https://audioconverter.ai/youtube-to-mp4-converter', d: 'MP4 HD and 4K', c: 'bg-sky-600', i: 'v', b: false },
  { n: 'Hicoo', u: 'https://hicoo.ai/mp4-converter/youtube-to-mp4', d: 'MP4 360p to 4K', c: 'bg-emerald-600', i: 'z', b: false },
];
interface VI { title: string; author: string; thumbnail: string; duration: number; views: number; published: number; }

export default function Home() {
  const [url, setUrl] = useState('');
  const [fmt, setFmt] = useState<'audio'|'video'>('video');
  const [phase, setPhase] = useState<'input'|'loading'|'ready'|'error'>('input');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState<VI|null>(null);
  const [copied, setCopied] = useState(false);
  const [dk, setDk] = useState(false);
  const [launched, setLaunched] = useState<string|null>(null);
  const [thOk, setThOk] = useState(false);
  const ir = useRef<HTMLInputElement>(null);
  const ar = useRef<AbortController|null>(null);
  const valid = useMemo(() => { const t = url.trim(); return t.length > 5 && !!getId(t); }, [url]);
  const meta = useMemo(() => { if (!info) return ''; const p: string[] = []; if (info.author) p.push(info.author); if (info.duration) p.push(fD(info.duration)); if (info.views) p.push(fV(info.views)); if (info.published) p.push(fT(info.published)); return p.join(' \u00b7 '); }, [info]);

  useEffect(() => {
    try { const v = localStorage.getItem('dk') === '1'; setDk(v); document.documentElement.classList.toggle('dark', v); } catch {}
    ir.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && phase !== 'loading') { setPhase('input'); setInfo(null); setUrl(''); setCopied(false); setLaunched(null); setThOk(false); ir.current?.focus(); } };
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc);
  }, []);
  const toggleDk = () => { const n = !dk; setDk(n); try { localStorage.setItem('dk', n ? '1' : '0'); } catch {} document.documentElement.classList.toggle('dark', n); };
  const fetchInfo = useCallback(async () => {
    const t = url.trim();
    if (!t || !getId(t)) { setErr('Paste a valid YouTube URL (youtube.com, youtu.be, shorts, live, or embed)'); setPhase('error'); return; }
    setErr(''); setPhase('loading'); setInfo(null); setCopied(false); setLaunched(null); setThOk(false);
    ar.current?.abort(); const ac = new AbortController(); ar.current = ac;
    const timer = setTimeout(() => ac.abort(), 10000);
    try {
      const r = await fetch('/api/video-info?url=' + encodeURIComponent(t), { signal: ac.signal }); clearTimeout(timer);
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Video not found'); }
      const d = await r.json(); if (!d?.title) throw new Error('Could not load video info');
      setInfo({ title: String(d.title), author: String(d.author||''), thumbnail: String(d.thumbnail||''), duration: Number(d.duration)||0, views: Number(d.views)||0, published: Number(d.published)||0 });
      setPhase('ready');
    } catch (e: any) { clearTimeout(timer); setErr(e.name === 'AbortError' ? 'Request timed out. Check your connection.' : (e.message || 'Something went wrong.')); setPhase('error'); }
  }, [url]);
  const vid = info ? getId(url.trim()) : null;
  const go = useCallback((x: typeof CVTS[0]) => { if (launched === x.n) return; setLaunched(x.n); navigator.clipboard.writeText(url.trim()).then(() => setCopied(true)).catch(() => {}); window.open(x.u, '_blank', 'noopener,noreferrer'); }, [url, launched]);
  const sel = () => ir.current?.select();
  if (phase === 'loading') return (<div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 gap-3" role="status" aria-label="Loading video info"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /><p className="text-sm text-gray-400">Fetching video info…</p></div>);
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors">
      <header className="border-b dark:border-gray-700 bg-white dark:bg-gray-800 sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 flex items-center justify-center"><Video className="w-5 h-5" /></div>
          <div className="flex-1"><h1 className="text-lg font-bold">YT Convert</h1><p className="text-xs text-gray-500 dark:text-gray-400">YouTube to MP3 & MP4</p></div>
          <button onClick={toggleDk} aria-label={dk ? 'Switch to light mode' : 'Switch to dark mode'} className="w-10 h-10 rounded-xl border dark:border-gray-600 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">{dk ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}</button>
        </div>
      </header>
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 space-y-5">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 dark:border-gray-700 p-5 space-y-4">
          <label htmlFor="yt-url" className="text-sm font-medium block">YouTube URL</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input ref={ir} id="yt-url" type="url" placeholder="https://www.youtube.com/watch?v=..." value={url} onChange={e => setUrl(e.target.value)} onFocus={sel} onKeyDown={e => { if (e.key === 'Enter') fetchInfo(); }} className={"w-full pl-10 pr-10 py-3 border-2 rounded-xl text-base bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none transition-colors "+(valid?'border-green-500 dark:border-green-400 focus:border-green-600':url.trim()?'border-red-400 dark:border-red-500 focus:border-red-500':'border-gray-300 dark:border-gray-600 focus:border-gray-900 dark:focus:border-gray-400')} aria-label="YouTube video URL" />
              {url.trim() && <div className="absolute right-3 top-1/2 -translate-y-1/2">{valid ? <Check className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-400" />}</div>}
            </div>
            {(phase === 'input' || phase === 'error') && <button onClick={fetchInfo} disabled={!valid} className="px-5 py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-medium disabled:opacity-40 transition-opacity" aria-label="Get video info"><ArrowRight className="w-4 h-4 inline" /> Go</button>}
          </div>
          {phase === 'input' && (
            <div className="flex gap-2">
              <button onClick={() => setFmt('audio')} aria-pressed={fmt === 'audio'} className={"flex-1 py-2.5 rounded-xl text-sm font-medium border-2 flex items-center justify-center gap-2 transition-colors "+(fmt==='audio'?'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white':'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500')}><Music className="w-4 h-4" />MP3</button>
              <button onClick={() => setFmt('video')} aria-pressed={fmt === 'video'} className={"flex-1 py-2.5 rounded-xl text-sm font-medium border-2 flex items-center justify-center gap-2 transition-colors "+(fmt==='video'?'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white':'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500')}><Video className="w-4 h-4" />MP4</button>
            </div>
          )}
        </div>
        {phase === 'error' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-red-200 dark:border-red-900/50 p-5 space-y-3" role="alert">
            <p className="text-red-600 dark:text-red-400 text-sm flex items-start gap-2"><XCircle className="w-4 h-4 shrink-0 mt-0.5" />{err}</p>
            <button onClick={() => { setPhase('input'); setErr(''); ir.current?.focus(); }} className="text-sm border dark:border-gray-600 rounded-lg px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Try Again</button>
          </div>
        )}
        {phase === 'ready' && info && vid && (
          <>
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 dark:border-gray-700 p-4 space-y-2">
              <div className="relative rounded-xl overflow-hidden bg-black cursor-pointer" onClick={() => window.open('https://www.youtube.com/watch?v='+vid,'_blank','noopener,noreferrer')} role="link" aria-label={'Watch '+info.title}>
                {!thOk && <div className="w-full bg-gray-200 dark:bg-gray-700 animate-pulse" style={{minHeight:200}} />}
                <img src={info.thumbnail} alt={info.title} className={thOk?'w-full':'hidden'} style={{maxHeight:300}} loading="lazy" onLoad={() => setThOk(true)} />
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-80 hover:opacity-100 transition-opacity"><Play className="w-12 h-12 text-white" fill="white" /></div>
              </div>
              <h3 className="font-semibold text-sm leading-snug">{info.title}</h3>
              {meta && <p className="text-xs text-gray-500 dark:text-gray-400">{meta}</p>}
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 dark:border-gray-700 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Download as {fmt === 'audio' ? 'MP3' : 'MP4'}</h2>
                <button onClick={() => { setPhase('input'); setInfo(null); setCopied(false); setLaunched(null); setThOk(false); ir.current?.focus(); }} className="text-xs text-gray-500 dark:text-gray-400 border dark:border-gray-600 rounded-lg px-3 py-1 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">New</button>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-3 text-xs text-gray-600 dark:text-gray-300">
                <p className="font-medium text-gray-900 dark:text-gray-100 mb-1"><Info className="w-3.5 h-3.5 inline" /> How to download:</p>
                <ol className="list-decimal list-inside space-y-0.5"><li>Tap a converter below</li><li>Your URL is auto-copied - paste it</li><li>Pick quality and download</li></ol>
              </div>
              {copied && <div role="status" aria-live="polite" className="text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-3 py-2 rounded-lg"><CheckCircle2 className="w-4 h-4 inline" /> URL copied! Paste it in the converter tab.</div>}
              <div className="space-y-2">
                {CVTS.map(x => { const op = launched === x.n; return (
                  <button key={x.n} onClick={() => go(x)} disabled={op} aria-label={'Open '+x.n} className={"w-full flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-colors "+(op?'border-green-400 dark:border-green-500 bg-green-50 dark:bg-green-900/20':'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 active:scale-[0.98]')}>
                    <div className={"w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0 "+x.c+(op?' scale-110':'')}>
                      {op ? <Check className="w-5 h-5" /> : <>{x.i==='d' && <Download className="w-5 h-5" />}{x.i==='z' && <Zap className="w-5 h-5" />}{x.i==='v' && <Video className="w-5 h-5" />}</>}
                    </div>
                    <div className="flex-1 min-w-0"><div className="flex items-center gap-1.5"><span className="font-semibold text-sm">{x.n}</span>{x.b && <span className="text-[10px] bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">Best</span>}</div><p className="text-xs text-gray-500 dark:text-gray-400">{op ? 'Opened — paste URL to convert' : x.d}</p></div>
                    {!op && <ExternalLink className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />}
                  </button>
                ); })}
              </div>
            </div>
          </>
        )}
        {phase === 'input' && (
          <div className="grid grid-cols-3 gap-3">
            {[{i:Music,t:'Audio',d:'Convert to MP3'},{i:Video,t:'Video',d:'Download MP4'},{i:Zap,t:'Fast',d:'Paste & go'}].map(f => (
              <div key={f.t} className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-3 text-center hover:shadow-sm transition-shadow"><div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center mx-auto mb-2"><f.i className="w-4 h-4 text-gray-700 dark:text-gray-300" /></div><h3 className="font-semibold text-sm">{f.t}</h3><p className="text-[11px] text-gray-500 dark:text-gray-400">{f.d}</p></div>
            ))}
          </div>
        )}
      </main>
      <footer className="border-t dark:border-gray-700 py-3 mt-auto text-center text-xs text-gray-400 dark:text-gray-500">YT Convert - For personal use only</footer>
    </div>
  );
  }
