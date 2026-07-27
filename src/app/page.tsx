"use client";
import { useState, useEffect } from "react";
const C = [
  { n: "Y2Mate", d: "Best MP4 144p-1080p, MP3 128-320kbps", u: "https://www.y2mate.com/youtube/" },
  { n: "Y2Mate alt", d: "Alternate Y2Mate domain", u: "https://y2mate.nu/youtube/" },
  { n: "AudioConverter", d: "MP4 HD and 4K", u: "https://audioconverter.to/youtube-converter" },
  { n: "Hicoo", d: "MP4 360p to 4K", u: "https://hicoo.com/youtube-downloader" },
];
export default function Home() {
  const [url, setUrl] = useState("");
  const [info, setInfo] = useState<{ t: string; a: string; i: string } | null>(null);
  const [load, setLoad] = useState(false);
  const [dk, setDk] = useState(false);
  useEffect(() => {
    const v = localStorage.getItem("dk") === "1";
    setDk(v); document.documentElement.classList.toggle("dark", v);
  }, []);
  const toggle = () => {
    const n = !dk; setDk(n); localStorage.setItem("dk", n ? "1" : "0");
    document.documentElement.classList.toggle("dark", n);
  };
  const go = async () => {
    setLoad(true);
    try {
      const id = new URL(url).searchParams.get("v");
      const r = await fetch("/api/video-info?v=" + id);
      setInfo(await r.json());
    } catch { setInfo(null); }
    setLoad(false);
  };
  const open = (c: typeof C[0]) => { navigator.clipboard.writeText(url); window.open(c.u, "_blank"); };
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors">
      <div className="max-w-xl mx-auto p-6">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">YT Convert</h1>
          <button onClick={toggle} className="text-2xl p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700">{dk ? "☀️" : "🌙"}</button>
        </div>
        <div className="flex gap-2 mb-6">
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." className="flex-1 p-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 outline-none focus:ring-2 ring-blue-500" />
          <button onClick={go} disabled={!url || load} className="px-5 py-3 bg-blue-600 text-white rounded-lg font-semibold disabled:opacity-50">Go</button>
        </div>
        {info && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden mb-6">
            {info.i && <img src={info.i} alt="" className="w-full" />}
            <div className="p-4">
              <h2 className="text-lg font-bold mb-1">{info.t}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{info.a}</p>
              <h3 className="font-semibold mb-3">Download options</h3>
              <div className="grid grid-cols-2 gap-2">
                {C.map((c, i) => (
                  <button key={i} onClick={() => open(c)} className="p-3 bg-blue-50 dark:bg-gray-700 rounded-xl text-left hover:bg-blue-100 dark:hover:bg-gray-600 transition-colors">
                    <div className="font-semibold text-sm">{c.n}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{c.d}</div>
                  </button>
                ))}
              </div>
              <button onClick={() => setInfo(null)} className="mt-4 w-full p-2 text-sm text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 rounded-lg">New</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
