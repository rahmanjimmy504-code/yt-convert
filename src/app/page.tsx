'use client';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Download, Music, Video, Link2, XCircle, ArrowRight, Zap, ExternalLink, Play, CheckCircle2, Sun, Moon, Check, Shield, Eye, Calendar } from 'lucide-react';

function getId(u: string) { const m = u.match(/(?:v=|youtu\.be\/|shorts\/|live\/|embed\/|clip\/)([a-zA-Z0-9_-]{11})/); return m ? m[1] : null; }
function fD(s: number) { if (!s) return ''; const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sc = s%60; return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(sc).padStart(2,'0')}` : `${m}:${String(sc).padStart(2,'0')}`; }
function fV(n: number) { if (!n) return ''; if (n >= 1e9) return (n/1e9).toFixed(1).replace(/\.0$/,'')+'B'; if (n >= 1e6) return (n/1e6).toFixed(1).replace(/\.0$/,'')+'M'; if (n >= 1e3) return (n/1e3).toFixed(1).replace(/\.0$/,'')+'K'; return n.toLocaleString(); }
function fT(ts: number) { if (!ts) return ''; return new Date(ts*1000).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'}); }

const CVTS = [
  { n: '9Convert', u: 'https://9convert.org/', d: 'MP4 144p-1080p, MP3 128-320kbps', g: 'from-rose-500 to-pink-600', i: 'd', b: true },
  { n: 'Y2Mate alt', u: 'https://en.y2mate.so/youtube-converter/', d: 'Alternate Y2Mate domain', g: 'from-orange-500 to-amber-600', i: 'z', b: false },
  { n: 'AudioConverter', u: 'https://audioconverter.ai/youtube-to-mp4-converter', d: 'MP4 HD and 4K', g: 'from-sky-500 to-blue-600', i: 'v', b: false },
  { n: 'Hicoo', u: 'https://hicoo.ai/mp4-converter/youtube-to-mp4', d: 'MP4 360p to 4K', g: 'from-emerald-500 to-teal-600', i: 'z', b: false },
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
  const [tip, setTip] = useState(0);
  const ir = useRef<HTMLInputElement>(null);
  const ar = useRef<AbortController|null>(null);
  const valid = useMemo(() => { const t = url.trim(); return t.length > 5 && !!getId(t); }, [url]);

  const tips = ['Supports youtube.com, youtu.be, shorts & live links', 'Your URL auto-copies when picking a converter', 'Press Enter to fetch, Escape to start over'];
  useEffect(() => { const i = setInterval(() => setTip(p => (p+1)%tips.length), 4000); return () => clearInterval(i); }, []);

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

  if (phase === 'loading') return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 gap-4" role="status" aria-label="Loading video info">
      <div className="relative"><div className="w-16 h-16 rounded-full border-4 border-gray-200 dark:border-gray-700"/><div className="w-16 h-16 rounded-full border-4 border-t-red-500 border-r-transparent border-b-transparent border-l-transparent absolute top-0 left-0 animate-spin"/></div>
      <p className="text-sm text-gray-400 animate-pulse">Finding your video...</p>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 text-gray-900 dark:text-gray-100 transition-colors">
      <header className="border-b border-gray-200/80 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 py-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-red-600 text-white flex items-center justify-center shadow-lg shadow-red-500/25"><Video className="w-5 h-5" /></div>
          <div className="flex-1"><h1 className="text-lg font-bold tracking-tight">YT Convert</h1><p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium">YouTube to MP3 & MP4</p></div>
          <button onClick={toggleDk} aria-label={dk ? 'Switch to light mode' : 'Switch to dark mode'} className="w-9 h-9 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 transition-all active:scale-95">{dk ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}</button>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-5 space-y-4">
        <div className="bg-white dark:bg-gray-800/80 rounded-2xl border border-gray-200/80 dark:border-gray-700/60 shadow-sm shadow-gray-200/50 dark:shadow-black/20 p-5 space-y-4">
          <label htmlFor="yt-url" className="text-sm font-semibold flex items-center gap-2"><Link2 className="w-4 h-4 text-red-500" /> Paste YouTube Link</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input ref={ir} id="yt-url" type="url" placeholder="https://www.youtube.com/watch?v=..." value={url} onChange={e => setUrl(e.target.value)} onFocus={sel} onKeyDown={e => { if (e.key === 'Enter') fetchInfo(); }} className={"w-full pl-10 pr-10 py-3 border-2 rounded-xl text-base bg-gray-50 dark:bg-gray-900/60 text-gray-900 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-600 focus:outline-none transition-all duration-200 "+(valid?'border-green-500 dark:border-green-400 focus:ring-4 focus:ring-green-500/10 dark:focus:ring-green-400/10 shadow-sm shadow-green-500/10':url.trim()?'border-red-300 dark:border-red-500/60 focus:ring-4 focus:ring-red-500/10':'border-gray-200 dark:border-gray-600 focus:ring-4 focus:ring-gray-300 dark:focus:ring-gray-500/20')} aria-label="YouTube video URL" />
              {url.trim() && <div className="absolute right-3 top-1/2 -translate-y-1/2 transition-all duration-200">{valid ? <Check className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-400" />}</div>}
            </div>
            {(phase === 'input' || phase === 'error') && <button onClick={fetchInfo} disabled={!valid} className="px-5 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl font-medium disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-red-500/25 hover:shadow-red-500/40 active:scale-95 transition-all" aria-label="Get video info"><ArrowRight className="w-4 h-4" /></button>}
          </div>
          {phase === 'input' && (
            <div className="flex gap-2">
              <button onClick={() => setFmt('audio')} aria-pressed={fmt === 'audio'} className={"flex-1 py-2.5 rounded-xl text-sm font-medium border-2 flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.97] "+(fmt==='audio'?'bg-gradient-to-r from-red-500 to-red-600 text-white border-transparent shadow-md shadow-red-500/20':'bg-white dark:bg-gray-900/40 border-gray-200 dark:border-gray-600 hover:border-red-300 dark:hover:border-red-500/50')}><Music className="w-4 h-4" />MP3</button>
              <button onClick={() => setFmt('video')} aria-pressed={fmt === 'video'} className={"flex-1 py-2.5 rounded-xl text-sm font-medium border-2 flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.97] "+(fmt==='video'?'bg-gradient-to-r from-red-500 to-red-600 text-white border-transparent shadow-md shadow-red-500/20':'bg-white dark:bg-gray-900/40 border-gray-200 dark:border-gray-600 hover:border-red-300 dark:hover:border-red-500/50')}><Video className="w-4 h-4" />MP4</button>
            </div>
          )}
        </div>

        {phase === 'input' && !url.trim() && (
          <p key={tip} className="text-xs text-gray-400 dark:text-gray-500 text-center animate-[fadeIn_0.3s_ease-in-out]">{tips[tip]}</p>
        )}

        {phase === 'error' && (
          <div className="bg-red-50 dark:bg-red-950/30 rounded-2xl border border-red-200/80 dark:border-red-800/40 p-5 space-y-3" role="alert">
            <p className="text-red-600 dark:text-red-400 text-sm flex items-start gap-2"><XCircle className="w-4 h-4 shrink-0 mt-0.5" />{err}</p>
            <button onClick={() => { setPhase('input'); setErr(''); ir.current?.focus(); }} className="text-sm text-red-600 dark:text-red-400 font-medium hover:underline">Try again</button>
          </div>
        )}

        {phase === 'ready' && info && vid && (
          <>
            <div className="bg-white dark:bg-gray-800/80 rounded-2xl border border-gray-200/80 dark:border-gray-700/60 shadow-sm overflow-hidden">
              <div className="relative rounded-t-2xl overflow-hidden bg-black cursor-pointer group" onClick={() => window.open('https://www.youtube.com/watch?v='+vid,'_blank','noopener,noreferrer')} role="link" aria-label={'Watch '+info.title}>
                {!thOk && <div className="w-full bg-gray-800 animate-pulse" style={{minHeight:210}}/>}
                <img src={info.thumbnail} alt={info.title} className={thOk?'w-full group-hover:scale-105 transition-transform duration-500':'hidden'} style={{maxHeight:300}} loading="lazy" onLoad={() => setThOk(true)} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20"/>
                <div className="absolute bottom-3 left-3 right-3"><h3 className="font-semibold text-sm text-white leading-snug drop-shadow-lg line-clamp-2">{info.title}</h3></div>
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200"><div className="w-14 h-14 rounded-full bg-red-600/90 flex items-center justify-center shadow-xl shadow-black/40"><Play className="w-6 h-6 text-white ml-0.5" fill="white"/></div></div>
                {info.duration > 0 && <div className="absolute top-3 right-3 bg-black/70 text-white text-xs font-medium px-2 py-1 rounded-lg backdrop-blur-sm">{fD(info.duration)}</div>}
              </div>
              <div className="p-4 space-y-2.5">
                {info.author && <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{info.author}</p>}
                <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
                  {info.views > 0 && <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{fV(info.views)} views</span>}
                  {info.published > 0 && <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{fT(info.published)}</span>}
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800/80 rounded-2xl border border-gray-200/80 dark:border-gray-700/60 shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-sm">Download as {fmt === 'audio' ? 'MP3' : 'MP4'}</h2>
                <button onClick={() => { setPhase('input'); setInfo(null); setCopied(false); setLaunched(null); setThOk(false); ir.current?.focus(); }} className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 font-medium transition-colors">+ New</button>
              </div>
              {copied && <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border border-green-200/60 dark:border-green-800/40 px-3.5 py-2.5 rounded-xl"><CheckCircle2 className="w-4 h-4" />URL copied — paste it in the converter</div>}
              <div className="space-y-2.5">
                {CVTS.map(x => { const op = launched === x.n; return (
                  <button key={x.n} onClick={() => go(x)} disabled={op} aria-label={'Open '+x.n} className={"w-full flex items-center gap-3.5 p-3.5 rounded-xl border text-left transition-all duration-200 group "+(op?'border-green-300 dark:border-green-600/60 bg-green-50 dark:bg-green-950/20':'border-gray-100 dark:border-gray-700/50 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm active:scale-[0.98]')}>
                    <div className={"w-10 h-10 rounded-xl bg-gradient-to-br "+x.g+" text-white flex items-center justify-center shrink-0 shadow-md "+(op?'scale-105':'group-hover:scale-105 transition-transform duration-200')}>
                      {op ? <Check className="w-5 h-5" /> : <>{x.i==='d' && <Download className="w-5 h-5" />}{x.i==='z' && <Zap className="w-5 h-5" />}{x.i==='v' && <Video className="w-5 h-5" />}</>}
                    </div>
                    <div className="flex-1 min-w-0"><div className="flex items-center gap-1.5"><span className="font-semibold text-sm">{x.n}</span>{x.b && <span className="text-[10px] font-bold bg-gradient-to-r from-amber-100 to-amber-200 dark:from-amber-900/60 dark:to-amber-800/60 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full">BEST</span>}</div><p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{op ? 'Opened — paste URL to convert' : x.d}</p></div>
                    {!op && <ExternalLink className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-gray-500 dark:group-hover:text-gray-400 transition-colors shrink-0" />}
                  </button>
                ); })}
              </div>
            </div>
          </>
        )}

        {phase === 'input' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-800/80 rounded-2xl border border-gray-200/80 dark:border-gray-700/60 shadow-sm p-4 space-y-3">
              <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">How it works</h3>
              <ol className="space-y-3">
                {[{s:'1',t:'Paste your YouTube link above'},{s:'2',t:'Preview the video info'},{s:'3',t:'Pick a converter & download'}].map((step,i) => (
                  <li key={i} className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-red-500 to-red-600 text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-sm shadow-red-500/20">{step.s}</div>
                    <span className="text-sm text-gray-700 dark:text-gray-300">{step.t}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[{i:Music,t:'Audio',d:'MP3 128-320k',g:'from-violet-500 to-purple-600'},{i:Video,t:'Video',d:'MP4 to 4K',g:'from-blue-500 to-cyan-600'},{i:Shield,t:'Safe',d:'No sign-up needed',g:'from-emerald-500 to-green-600'}].map(f => (
                <div key={f.t} className="bg-white dark:bg-gray-800/80 rounded-xl border border-gray-200/80 dark:border-gray-700/60 shadow-sm p-3.5 text-center hover:shadow-md transition-all duration-200 group">
                  <div className={"w-9 h-9 rounded-xl bg-gradient-to-br "+f.g+" flex items-center justify-center mx-auto mb-2 text-white shadow-sm group-hover:scale-110 transition-transform duration-200"}><f.i className="w-4 h-4" /></div>
                  <h3 className="font-semibold text-sm">{f.t}</h3>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{f.d}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-gray-200/80 dark:border-gray-800 py-4 mt-auto">
        <div className="max-w-2xl mx-auto px-4 flex items-center justify-center gap-2 text-xs text-gray-400 dark:text-gray-600">
          <Shield className="w-3.5 h-3.5" /><span>YT Convert — For personal use only</span>
        </div>
      </footer>
    </div>
  );
              }
